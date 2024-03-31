const express = require('express');
const axios = require("axios");
const cheerio = require("cheerio");



const app = express();
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/', async (req, res) => {
    try {
        const html = await axios.get("https://kartdrift.nexon.com/kartdrift/ko/news/announcement/list?searchKeywordType=THREAD_TITLE&keywords=%EC%BF%A0%ED%8F%B0");
        let ulList = [];
        const $ = cheerio.load(html.data);
        const $bodyList = $(".board_list ul").children("li");

        $bodyList.each(function (i, elem) {
            ulList[i] = {
                title: $(this).find('.tit span').text(),
                date: $(this).find('.info .date').text(),
                view: $(this).find('.view').text()
            };
        });

        res.json(ulList);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});