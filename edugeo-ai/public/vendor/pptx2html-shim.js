/**
 * JSZip v3 → v2 sync-method compatibility shim for pptx2html.
 *
 * The bundled pptx2html.full.js ships with JSZip v3.1.5 but uses the
 * old v2 sync API  (.asArrayBuffer())  which was removed in JSZip v3.
 * This shim wraps  JSZip.loadAsync  so that after every zip load it
 * eagerly extracts each file into an ArrayBuffer cache and patches the
 * sync  .asArrayBuffer()/.asText()  methods onto every ZipObject.
 *
 * Load this AFTER  pptx2html.full.js  (it must see  window.JSZip).
 */
(function () {
  "use strict";

  if (typeof JSZip === "undefined") return;

  var origLoadAsync = JSZip.loadAsync;

  JSZip.loadAsync = function shimmedLoadAsync(data) {
    return origLoadAsync.call(this, data).then(function shimAfterLoad(zip) {
      var files = [];

      zip.forEach(function (relativePath, file) {
        files.push(file);
      });

      // Eagerly extract every file so sync methods can return instantly later.
      return Promise.all(
        files.map(function (file) {
          return file.async("arraybuffer").then(function (buf) {
            file._syncArrayBuffer = buf;
          });
        })
      ).then(function () {
        files.forEach(function (file) {
          Object.defineProperty(file, "asArrayBuffer", {
            value: function () {
              return this._syncArrayBuffer;
            },
            writable: true,
            configurable: true,
          });
          Object.defineProperty(file, "asText", {
            value: function () {
              if (this._syncText !== undefined) return this._syncText;
              var buf = this._syncArrayBuffer;
              if (buf === undefined) return undefined;
              var dec = new TextDecoder("utf-8");
              this._syncText = dec.decode(new Uint8Array(buf));
              return this._syncText;
            },
            writable: true,
            configurable: true,
          });
        });
        return zip;
      });
    });
  };
})();