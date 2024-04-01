const express = require('express');
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const PORT = 8000;
const cors = require('cors');
const playwright = require('playwright');

app.use(cors());

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

/* 공지사항에서 제목 검색 => 쿠폰에 대한 데이터 */
const NEWS_COUPON_URL = "https://kartdrift.nexon.com/kartdrift/ko/news/announcement/list?searchKeywordType=THREAD_TITLE&keywords=%EC%BF%A0%ED%8F%B0";
/* 소셜 이벤트에서 내용 검색 => 쿠폰에 대한 데이터 */
const CM_EVENT_COUPON_URL = "https://kartdrift.nexon.com/kartdrift/ko/news/communityevent/list?searchKeywordType=THREAD_CONTENT&keywords=%EC%BF%A0%ED%8F%B0";
/* 카드맆 홈페이지 메뉴 가이드 - 확률정보 => 플러스 박스 카트바디, 캐릭터에 대한 데이터 (나머지 풍선이나 스티커에 대한건 패스) */
const PLUS_BOX_PROB_URL = "https://now.nexon.com/service/kd-live?page=8c36d678-41cb-4303-b63e-17d66b781071";

/* cheerio로 크롤링 */
const getHtml = async (url, resource, response, selector) => {
    try {
        const html = await axios.get(url);
        const $ = cheerio.load(html.data);

        let list = [];
        let object;
        let $bodyList = $(selector);

        $bodyList.each(function (i) {
            switch (resource) {
                case "news":
                case "cm_event":
                    object = {
                        title: $(this).find('.tit span').text(),
                        date: $(this).find('.info .date').text(),
                        view: $(this).find('.view').text()
                    }
    
                    break;
                default:
                    break;
            }

            list[i] = object;
        });

        response.json(list);
    } catch (error) {
        console.error(error);
        response.status(500).json({ error: 'Internal Server Error' });
    }
}

/* puppeteer 로 크롤링 (spa 사이트일경우) 
https://hun-dev.tistory.com/44
*/
const getSPAHtml = async (url, resource, response, selector) => {
    const browser = await playwright.chromium.launch({ 
        headless: true
    });
    const page = await browser.newPage();
    await page.goto(url);

    let data;

    switch (resource) {
        case "plus_box":
            data = await page.evaluate(() => {
                return {
                    title: document.title,
                };
            });
            break;

        default:
            data = {};
            break;
    }

    await browser.close();
    response.json(data);
}


app.get('/api/coupon/:resource', (req, res) => {
    let { resource } = req.params;

    switch (resource) {
        case "news": 
            getHtml(NEWS_COUPON_URL, resource, res, ".board_list ul li");
            break;
        case "cm_event":
            getHtml(CM_EVENT_COUPON_URL, resource, res, ".board_list ul li");
            break;
        default:
            res.status(404).json({ error: 'Not Found' });
            break;
    }
});

app.get('/api/prob/:resource', async (req, res) => {
    let { resource } = req.params;

    switch (resource) {
        case "plus_box":
            getSPAHtml(PLUS_BOX_PROB_URL, resource, res);
            break;
        default:
            res.status(404).json({ error: 'Not Found' });
            break;
    }
});

module.exports = app;