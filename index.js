const axios = require("axios");
const cheerio = require("cheerio");
const log = console.log;

const getHtml = async () => {
    try {
        return await axios.get("https://kartdrift.nexon.com/kartdrift/ko/news/announcement/list?searchKeywordType=THREAD_TITLE&keywords=%EC%BF%A0%ED%8F%B0");
    } catch (error) {
        console.error(error);
    }
};

getHtml()
    .then(html => {
        let ulList = [];
        const $ = cheerio.load(html.data);
        const $bodyList = $(".board_list ul").children("li");

        $bodyList.each(function(i, elem) {
            ulList[i] = {
                title: $(this).find('.tit span').text(),
                date: $(this).find('.info .date').text(),
                view: $(this).find('.view').text()
            };
        });

        return ulList;
    })
    .then(res => log(res));