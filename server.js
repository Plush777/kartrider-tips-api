const express = require('express');
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const PORT = 8000;
const cors = require('cors');
const puppeteer = require('puppeteer');
const LRU = require('lru-cache');
require('dotenv').config()

app.use(cors());

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const dataCache = new LRU({
    max: 350,
    ttl: 7 * 24 * 60 * 60 * 1000
});

/* 카트 홈페이지 메뉴 - 가이드에 있는 게시글들 */
const GUIDE_URL = "https://kartdrift.nexon.com/kartdrift/ko/guide/gameguide/list";
/* 카트 홈페이지 메뉴 - 가이드 - 카트바디 도감 */
const KART_LIST_URL = "https://kartdrift.nexon.com/kartdrift/ko/guide/gameguide/view?threadId=2490274";
/* 카트 개발자노트 게시글 */
const DEV_NOTE_URL = "https://kartdrift.nexon.com/kartdrift/ko/news/announcement/list?searchKeywordType=THREAD_TITLE&keywords=%EA%B0%9C%EB%B0%9C%EC%9E%90%EB%85%B8%ED%8A%B8"
/* 카트 업데이트 게시글 */
const UPDATE_URL = "https://kartdrift.nexon.com/kartdrift/ko/news/update/list";

/* 
    https://blog.ssogari.dev/25
    치지직에서 카트라이더 드리프트 검색했을 때 라이브 중인 유저 

    size: 반환할 결과의 수
    offset: 결과 목록의 시작점. (기본은 0부터 시작)
    ex) 전체 결과 개수가 10개라고 했을 때, 
    offset=1 => 9개의 결과만 가져옴
    offset=9 => 1개의 결과만 가져옴

    즉, 전체 개수에서 1씩 뺀다 생각하면 됨.
*/
const KART_LIVE_URL = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8`;

const NAVER_API_BASE_URL = 'https://openapi.naver.com';

const GAME_RANK_IMAGE_URL = `${NAVER_API_BASE_URL}/v1/search/image`;

const NEWS_URL = `${NAVER_API_BASE_URL}/v1/search/news`;

const apiObject = {
    chzzk: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        },
        params: {
            chzzkParam: function (offset, size) {
                return {
                    offset: offset,
                    size: size
                }
            }
        }
    },
    naver: {
        headers: {
            'Content-Type': 'application/xml',
            'X-Naver-Client-Id': process.env.NEXT_PUBLIC_NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': process.env.NEXT_PUBLIC_NAVER_CLIENT_SECRET
        },
        search: {
            params: {
                search: function (query, display, start, sort, filter) {
                    return {
                        query: query,
                        display: display,
                        start: start,
                        sort: sort,
                        filter: filter
                    }
                }
            }
        }
    }
}

const naverApiHeader = apiObject.naver.headers;

const getData = async (url, headers, params) => {
    try {
        const response = await axios.get(url, {
            headers: headers,
            params: params
        });

        return response.data;
    } catch (error) {
        console.error(error);
    }
}

const blockResource = (page) => {
    page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['stylesheet', 'font'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });
}

const sharesUpDownCondition = (gameRankUpDown) => {
    if (gameRankUpDown > 0) return 'up';
    if (gameRankUpDown < 0) return 'down';
    if (gameRankUpDown === 0) return 'noChange';
    return undefined;
}

const getHtml = async (url, resource, response, selector, condition) => {
    try {
        const html = await axios.get(url);
        const $ = cheerio.load(html.data);

        let list = [];
        let object;
        let $bodyList = $(selector);

        if (condition === 'kartdrift') {
            $bodyList.each(function (i, item) {

                if (i >= 4) return false;

                switch (resource) {
                    case "news":
                        object = {
                            title: $(this).find('.tit span').text(),
                            date: $(this).find('.info .date').text(),
                            view: $(this).find('.view').text()
                        }

                        break;
                    case "guide":
                    case "cm_event":
                    case "dev":
                    case "update":
                        object = {
                            title: $(this).find('.tit span').text(),
                            date: $(this).find('.info .date').text(),
                            view: $(this).find('.view').text(),
                            url: `https://kartdrift.nexon.com${$(this).find('a').attr('href')}`
                        }

                        break;
                    default:
                        break;
                }

                list[i] = object;
            });
        } else if (condition === 'kart') {
            $bodyList.each(function (i, item) {
                let kartArray = [];

                $(this).find('tr td[style*="background-color:black"] span[style*="letter-spacing:-1.0pt"]').each(function (i, item) {
                    kartArray.push($(this).text());
                });

                const kartArrayJoin = kartArray.join('');

                function extractItemsFromArray(str) {
                    const regex = /\[[^\]]+\]\s*[^[]*/g;
                    let results = str.match(regex) || [];
                    return results;
                }

                const extractedItems = extractItemsFromArray(kartArrayJoin);

                const kartTypeSelector = 'tr td[style*="background-color:#9a68f4"] span[style*="letter-spacing"], tr td[style*="background-color: rgb(154, 104, 244)"] span[style*="letter-spacing"], tr td[style*="background-color:#ee6060"] span[style*="letter-spacing"], tr td[style*="background-color:#6b72fb"] span[style*="letter-spacing"]'
                /* 
                    240630 주의사항 추가 
                    밸런스형 텍스트들의 background-color는 #9a68f4로 다 되어있는데,
                    스펙터만 혼자 rgb(154, 104, 244) 로 되어있어서 1개 누락되는 부분이 있으므로 rgb도 잘 봐야하고,
                    셀렉터 띄어쓰기도 잘 되어있는지 확인해야 함.
                */
                let kartTypeArray = [];

                $(this).find(kartTypeSelector).each(function (index) {
                    let text = $(this).text();
                    let matches = text.match(/밸런스형|속도형|드리프트형/g);
                    if (matches) {
                        kartTypeArray.push(...matches);
                    }
                });

                let imgArray = [];

                $(this).find('tr td img').each(function (i, item) {
                    // console.log(item.attribs.src);

                    imgArray[i] = item.attribs.src;
                });

                let statArray = [];

                $(this).find('tr td:not([style*="background-color"]) span[style*="letter-spacing"]').each(function (i, item) {
                    /* 정규식으로 0 ~ 9까지의 숫자만 가져옵니다. */
                    let match = $(this).text().match(/\d+/g);

                    /* 
                        null값이 아닌 값만 statArray에 넣는데
                        이 때, 값들은 문자열이기 때문에
                        map 메서드로 한번에 모든 값들을 숫자로 바꿉니다.
                    */
                    if (match !== null) {
                        statArray.push(...match.map(Number));
                    }
                });

                /* 
                    카트바디 1개 당 수치는 총 4개이기 때문에,
                    for 문으로 statArray에 있는 모든 값들을 반복하면서
                    slice 메서드로 4개씩 자릅니다.

                    자른 값들을 결과값 저장하는 배열 안에 객체로 하나씩 각각 넣어줍니다.
                */
                let statResultArray = [];

                for (let i = 0; i < statArray.length; i += 4) {
                    let sliceItem = statArray.slice(i, i + 4);
                    statResultArray.push({ array: sliceItem });
                }

                object = {
                    name: extractedItems,
                    type: kartTypeArray,
                    imgs: imgArray,
                    stats: statResultArray
                }

                list[i] = object;
            });
        } else if (condition === 'ranking') {
            $bodyList.each(function (i, item) {
                object = {
                    title: $(this).find('.game-name a').text(),
                    rankChange: $(this).find('.rankChange').text(),
                    rankStatus: $(this).find('.rankChange > span').attr('class'),
                    rank: $(this).find('.rank').text(),
                    img: $(this).find('.game-icon').attr('src')
                }

                list[i] = object;
            });
        }

        response.json(list);
    } catch (error) {
        console.error(error);
        response.status(500).json({ error: 'Internal Server Error' });
    }
};

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const validImageFn = async (url) => {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok && response.headers.get('Content-Type').startsWith('image/');
    } catch (error) {
        console.error('이미지 유효성 검사', error);
        return false;
    }
}

const getGameStatsData = async (cursor = 1) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const pageSize = 50;
    const successUrl = 'https://www.thelog.co.kr/stats/gameStats.do';
    const cursorPageUrl = 'https://www.thelog.co.kr/stats/rank/GameRealRank.do';
    const cursorApiUrl = `https://www.thelog.co.kr/api/service/getRealTimeRank.do?page=${cursor}&sort=game_rank&sortOption=ASC&gameDataType=A`;

    blockResource(page);

    const myId = process.env.THE_LOG_MY_ID;
    const myPw = process.env.THE_LOG_MY_PASSWORD;

    await page.goto('https://www.thelog.co.kr/index.do');

    const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('.gnb_home .logout_btn');
    });

    if (!isLoggedIn) {
        await page.click('.login_btn');
        await page.waitForSelector('#loginId', { visible: true });
        await page.focus('#loginId');
        await page.keyboard.type(myId);
        await page.focus('#loginPasswd');
        await page.keyboard.type(myPw);

        await page.click('input.btn_login');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        if (page.url() !== successUrl) {
            console.error('로그인 실패');
            await browser.close();
            return [];
        }
    } else {
        await page.goto(cursorPageUrl);
    }

    if (page.url() === successUrl) {
        console.log('로그인 성공');

        const data = await page.evaluate(async (cursorApiUrl) => {
            const response = await fetch(cursorApiUrl);
            if (!response.ok) console.error('API 호출 실패');
            return await response.json();
        }, cursorApiUrl);

        const gameDataArray = data.realTimeRank;

        const cursorNumber = Number(cursor);
        const nextCursor = gameDataArray.length < pageSize ? null : cursorNumber + 1;

        const result = gameDataArray.map((_, index) => {
            const arrayIndex = gameDataArray[index];

            return {
                title: arrayIndex.gameName,
                rank: arrayIndex.gameRank,
                gameRankUpDown: arrayIndex.gameRankUpDown,
                shares: arrayIndex.gameShares,
                sharesStatus: sharesUpDownCondition(arrayIndex.gameRankUpDown),
                useStoreCount: arrayIndex.useStoreCount,
                targetDate: arrayIndex.targetDate
            }
        });

        // console.log(result)
        await browser.close();
        return { result, nextCursor };
    } else {
        await browser.close();
        return [];
    }
};

async function fetchImagesForGame(game) {
    const cachedImage = dataCache.get(game.title);
    // console.log(game);

    if (cachedImage) return cachedImage;

    const searchImageApiParams = apiObject.naver.search.params.search(
        `${game.title}`, 1, 1, 'sim', 'small'
    );

    const fetchImageResult = await getData(GAME_RANK_IMAGE_URL, naverApiHeader, searchImageApiParams);

    console.log(fetchImageResult);

    if (fetchImageResult && fetchImageResult.items && fetchImageResult.items.length > 0) {
        dataCache.set(game.title, fetchImageResult);
        return fetchImageResult;
    } else {
        return null; // 유효하지 않은 경우 null 반환
    }
}

async function fetchImagesInBatches(games, batchSize = 10, delay = 800) {
    const results = [];

    // 배치 단위로 요청 처리
    for (let i = 0; i < games.length; i += batchSize) {
        const batch = games.slice(i, i + batchSize);

        // 현재 배치의 요청을 모두 처리하고 결과를 수집
        const batchResults = await Promise.all(batch.map(game => fetchImagesForGame(game)));

        // 결과를 최종 결과 배열에 추가
        results.push(...batchResults);

        // 다음 배치 처리 전에 지연 추가
        if (i + batchSize < games.length) {
            await sleep(delay);
        }
    }

    return results;
}

app.get('/api/article/:resource', (req, res) => {
    let { resource } = req.params;

    switch (resource) {
        case "guide":
            getHtml(GUIDE_URL, resource, res, ".board_list:not(.notice) ul li", "kartdrift");
            break;
        case "dev":
            getHtml(DEV_NOTE_URL, resource, res, ".board_list:not(.notice) ul li", "kartdrift");
            break;
        case "update":
            getHtml(UPDATE_URL, resource, res, ".board_list:not(.notice) ul li", "kartdrift");
            break;
        default:
            res.status(404).json({ error: 'Not Found' });
            break;
    }
});

app.get('/api/kart', (req, res) => {
    getHtml(KART_LIST_URL, null, res, ".MsoTableGrid[width]", "kart");
});

app.get('/api/chzzk/:info', async (req, res) => {
    let { info } = req.params;

    switch (info) {
        case "live":
            let offset = 0;
            let size = 3;

            const headers = apiObject.chzzk.headers;
            const params = apiObject.chzzk.params.chzzkParam(offset, size);

            if (req.query.offset) {
                offset = req.query.offset;
            }

            if (req.query.size) {
                size = req.query.size;
            }

            const liveData = await getData(KART_LIVE_URL, headers, params);

            res.json(liveData);
            break;
        default:
            res.status(404).json({ error: 'Not Found' });
            break;
    }
});

app.get('/api/games', async (req, res) => {
    const cursor = req.query.cursor || null;

    try {
        console.log('Fetching new data...');

        const { result, nextCursor } = await getGameStatsData(cursor);
        res.json({ result, nextCursor });
    } catch (error) {
        console.error(error);
    }
});

app.get('/api/games/images', async (req, res) => {
    const cursor = req.query.cursor || null;

    try {
        console.log('Fetching new images...');

        const { result } = await getGameStatsData(cursor);
        const images = await fetchImagesInBatches(result);

        res.json(images);
    } catch (error) {
        console.error(error);
    }
});

app.get('/api/games/news', async (req, res) => {
    const searchParams = apiObject.naver.search.params.search('카트라이더 드리프트', 4, 1, 'sim');
    const news = await getData(NEWS_URL, naverApiHeader, searchParams);

    res.json(news);
});

module.exports = app;