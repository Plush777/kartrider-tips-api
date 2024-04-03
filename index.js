const express = require('express');
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const PORT = 8000;
const cors = require('cors');

app.use(cors());

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

/* 공지사항에서 제목 검색 => 쿠폰에 대한 데이터 */
const NEWS_COUPON_URL = "https://kartdrift.nexon.com/kartdrift/ko/news/announcement/list?searchKeywordType=THREAD_TITLE&keywords=%EC%BF%A0%ED%8F%B0";
/* 소셜 이벤트에서 내용 검색 => 쿠폰에 대한 데이터 */
const CM_EVENT_COUPON_URL = "https://kartdrift.nexon.com/kartdrift/ko/news/communityevent/list?searchKeywordType=THREAD_CONTENT&keywords=%EC%BF%A0%ED%8F%B0";
/* 카트 홈페이지 메뉴 - 가이드에 있는 게시글들 */
const GUIDE_URL = "https://kartdrift.nexon.com/kartdrift/ko/guide/gameguide/list";
/* 카트 홈페이지 메뉴 - 가이드 - 카트바디 도감 */
const KART_LIST_URL = "https://kartdrift.nexon.com/kartdrift/ko/guide/gameguide/view?threadId=2490274";

/*
    에러 나는경우

    1. url이 잘못되거나 해당 페이지가 사라짐
    2. 넥슨 홈페이지가 점검 중임 (매주 목요일)
    3. 해당 페이지의 html 구조가 변경되거나 클래스가 변경된 경우

*/

const getHtml = async (url, resource, response, selector, condition) => {
    try { 
        const html = await axios.get(url);
        const $ = cheerio.load(html.data);

        let list = [];
        let object;
        let $bodyList = $(selector);

        if (condition === 'kartdrift') {
            $bodyList.each(function (i) {
                switch (resource) {
                    case "news":
                    case "guide":
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
        } else if (condition === 'kart') {
            $bodyList.each(function (i, item) {

                /* 
                    1. kartName을 전부 가져옵니다.
                    2. 하나의 문자열로 된 데이터에서 split, 정규식을 사용해서 prefix를 기준으로 문자열들을 분리하고 배열로 만듭니다.
                    3. 분리시킨 배열 아이템들 중에서 공백이 없는 아이템들만 filter로 걸러냅니다.
                    4. " 연습카트" << 이런식의 텍스트 공백을 정규식으로 제거합니다.
                */
                let kartNames = $(this).find('tr td[style*="background-color:black"] span[style*="letter-spacing:-1.0pt"]').text();
                let kartNamePrefix = kartNames.split(/\[일반\]|\[희귀\]|\[고급\]|\[영웅\]|\[전설\]/);
                let kartNameSplitArray = kartNamePrefix.filter((name) => name.trim() !== "");
                let kartNameTrimmedArray = kartNameSplitArray.map((name) => name.replace(/^ /, ''));

                /* kartType 문자열을 가져옵니다. 얘는 구분자가 없기 때문에 match랑 정규식을 사용해 문자열을 분리하여 배열로 받습니다.
                 
                    *match: 문자열에서 정규식과 일치하는 부분을 찾아 배열로 반환.
                */
                const kartTypeSelector = 'tr td[style*="background-color:#9a68f4"] span[style*="letter-spacing:-1.0pt"], tr td[style*="background-color:#ee6060"] span[style*="letter-spacing:-1.0pt"], tr td[style*="background-color:#6b72fb"] span[style*="letter-spacing:-1.0pt"]'
                let kartTypes = $(this).find(kartTypeSelector).text();
                let kartTypeStringMatchArray = kartTypes.match(/밸런스형|속도형|드리프트형/g);

                object = {
                    name: kartNameTrimmedArray,
                    type: kartTypeStringMatchArray
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

app.get('/api/coupon/:resource', (req, res) => {
    let { resource } = req.params;

    switch (resource) { 
        case "news": 
            getHtml(NEWS_COUPON_URL, resource, res, ".board_list ul li", "kartdrift");
            break;
        case "cm_event":
            getHtml(CM_EVENT_COUPON_URL, resource, res, ".board_list ul li", "kartdrift");
            break;
        default:
            res.status(404).json({ error: 'Not Found' });
            break;
    }
});

app.get('/api/article/:resource', (req, res) => {
    let { resource } = req.params;

    switch (resource) { 
        case "guide": 
            getHtml(GUIDE_URL, resource, res, ".board_list ul li", "kartdrift");
            break;
        default:
            res.status(404).json({ error: 'Not Found' });
            break;
    }
});

app.get('/api/kart', (req, res) => {
    getHtml(KART_LIST_URL, null, res, ".MsoTableGrid[width]", "kart");
});

module.exports = app;