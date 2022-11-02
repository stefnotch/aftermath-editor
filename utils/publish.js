/*
 * Add the following to your package.json
 * "deploy": "vite build --base=/tgi-pages/ && node utils/publish.js"
 */
import { publish } from "gh-pages";

publish("dist", { history: false, dotfiles: true }, (err) => {
  if (err) console.error(err);
  else console.log("Published to GitHub");
});
