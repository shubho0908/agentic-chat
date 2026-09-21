import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PdfDocuments } from "./components/chat/pdfDocuments";
import { writeFileSync } from "node:fs";

const pdfs = [
  { url: "https://utfs.io/f/hanuman.pdf", name: "hanuman-ansh-2026-box-office-collection.pdf", title: "Hanuman Ansh (2026): Box-Office Collection Report", size: 39731, pageCount: 3 },
  { url: "https://utfs.io/f/b.pdf", name: "quarterly-notes.pdf", size: 1204000, pageCount: 12 },
];

const card = renderToStaticMarkup(React.createElement(PdfDocuments, { pdfs }));

const html = (dark: boolean, width: number) => `<!doctype html>
<html class="${dark ? "dark" : ""}" style="${dark ? "background:#0a0a0a;color-scheme:dark" : "background:#fff"}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={darkMode:"class"}</script>
<style>body{font-family:Inter,system-ui,sans-serif}</style>
</head>
<body>
<div style="max-width:${width}px;margin:40px auto;padding:16px">
  <div style="font-size:15px;margin-bottom:8px;${dark ? "color:#eee" : "color:#111"}">Bhai, PDF taiyaar hai! Yeh raha report.</div>
  ${card}
</div>
</body></html>`;

writeFileSync("/tmp/card-light-desktop.html", html(false, 768));
writeFileSync("/tmp/card-dark-desktop.html", html(true, 768));
writeFileSync("/tmp/card-dark-mobile.html", html(true, 360));
console.log("written");
