const { JSDOM } = require("jsdom");
const fs = require("fs");

const clientHtml = fs.readFileSync("penpa-edit/docs/index.html");

// Hacks to load penpa-edit on NodeJS server side
const dom = new JSDOM(clientHtml);
const window = dom.window;
document = window.document;
Element = window.Element;
location = window.location;
dataLayer = [];
jQuery = require("jquery")(window);
$ = jQuery;
CanvasRenderingContext2D = undefined;
module = undefined;
easytimer = require("easytimer.js");
navigator = { platform: "", userAgent: "" };

// Load same list of Javascript files as penpa-edit's client index.html
// https://github.com/swaroopg92/penpa-edit/blob/3f1102e3a9450e731c88e9ac2d17baff0789377a/docs/index.html#L81-L135
const script_sources = [
    "./js/libs/jquery-3.7.0.min.js",
    "./js/libs/purify.min.js",
    "./js/libs/CanvasRenderingContext2D.ext.js",
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

    "./js/timer.js",
    "./js/conversion.js",
];

eval(
    script_sources.map(source => fs.readFileSync(`penpa-edit/docs/${source}`).toString()).join("\n") +
        "\n" +
        fs.readFileSync("common.js").toString() +
        fs.readFileSync("express.js").toString()
);
