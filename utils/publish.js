/*
 * Add the following to your package.json
 * "deploy": "vite build --base=/tgi-pages/ && node utils/publish.js"
 */
const ghpages = require("gh-pages");

ghpages.publish("dist", { history: false, dotfiles: true }, (err) => {
  if (err) console.error(err);
  else console.log("Published to GitHub");
});
