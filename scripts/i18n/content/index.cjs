const { common } = require("./common.cjs");
const { pages } = require("./pages.cjs");
const { pickLocalized } = require("./utils.cjs");

function getContent(locale) {
  return {
    common: pickLocalized(common, locale),
    pages: pickLocalized(pages, locale),
  };
}

module.exports = {
  common,
  pages,
  getContent,
};
