const { JSDOM } = require("jsdom");
const express = require("express");
const fs = require("fs");

const dom = new JSDOM(fs.readFileSync("penpa-edit/docs/index.html"));
const window = dom.window;
const document = window.document;
const Element = window.Element;
const location = window.location;
const dataLayer = [];
const jQuery = require("jquery")(dom.window);
const $ = jQuery;
module = undefined;

const scriptSources = [
    "./js/libs/jquery-3.7.0.min.js",
    "./js/libs/purify.min.js",
    // "./js/libs/CanvasRenderingContext2D.ext.js",
    "./js/libs/encoding.js",
    "./js/libs/vanillaSelectBox.js",
    "./js/libs/zlib.js",
    "./js/libs/spectrum.js",
    "./js/libs/canvas2svg.js",
    "./js/libs/select2.full.js",
    "./js/libs/gif.js",

    "./identity.js",
    "./js/settings.js",
    "./js/interface.js",
    "./js/conflicts.js",
    "./js/puzzlink.js",
    "./js/modes.js",
    "./js/genre_tags.js",
    "./js/constraints.js",
    "./js/main.js",
    "./js/class_p.js",
    "./js/class_square.js",
    "./js/class_hex.js",
    "./js/class_tri.js",
    "./js/class_pyramid.js",
    "./js/class_uniform.js",
    "./js/class_panel.js",
    "./js/style.js",
    "./js/general.js",
    "./js/customcolor.js",
    "./js/translate.js",
];

eval(
    scriptSources.map(source => fs.readFileSync(`penpa-edit/docs/${source}`).toString()).join("\n") +
        fs.readFileSync("server.js").toString()
);

const modifiedClientHtml = fs.readFileSync("penpa-edit/docs/index.html").toString().replace(
    "</body>",
    `<script>
    ${fs.readFileSync("client.js")}
    </script></body>`
);

const app = express();
app.get("/", (_, res) => res.redirect("/penpa-edit/docs/index.html"));
app.get("/penpa-edit/docs/index.html", (_, res) => {
    res.type("html");
    res.send(modifiedClientHtml);
});
app.use("/penpa-edit", express.static("penpa-edit"));
app.listen(5000, () => console.log("Starting server"));
