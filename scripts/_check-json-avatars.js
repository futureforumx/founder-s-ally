const fs = require("fs");
const data = JSON.parse(fs.readFileSync("public/data/vc_mdm_output.json", "utf8"));
const people = data.people || [];
const withAvatar = people.filter(p => p.avatar_url || p.profile_image_url);
const noAvatar = people.filter(p => !p.avatar_url && !p.profile_image_url);
console.log("Total people in JSON:", people.length);
console.log("With avatar_url or profile_image_url:", withAvatar.length);
console.log("Without any avatar:", noAvatar.length);

const urlTypes = {};
withAvatar.forEach(p => {
  const url = p.avatar_url || p.profile_image_url;
  const type = url.includes("signal-api") ? "nfx-signal" :
    url.includes("r2.dev") ? "r2-cdn" :
    url.includes("unavatar") ? "unavatar" :
    url.includes("gravatar") ? "gravatar" :
    url.includes("media.licdn") ? "linkedin-media" :
    url.includes("pbs.twimg") ? "twitter-media" :
    url.includes("cloudfront") ? "cloudfront" :
    "other";
  urlTypes[type] = (urlTypes[type] || 0) + 1;
});
console.log("URL types:", JSON.stringify(urlTypes, null, 2));

withAvatar.slice(0,5).forEach(p => console.log(p.full_name, "->", (p.avatar_url || p.profile_image_url).substring(0,90)));
