/* Browser fractal studio. Equations compile to real/imag arithmetic. One iteration applies them in order. */
(function () {
  var MAP_SRC = typeof COLORMAP_B64 !== "undefined" ? COLORMAP_B64 : globalThis.COLORMAP_B64;
  if (!MAP_SRC) throw new Error("fractal-maps.js must load before fractal.js");

  var MAP_NAMES = [
    "viridis", "plasma", "inferno", "magma", "cividis", "turbo",
    "twilight", "hot", "ocean", "gray", "jet", "rainbow"
  ];

  var FUNCS = {
    sin: 1, cos: 1, tan: 1, sinh: 1, cosh: 1, tanh: 1,
    exp: 1, log: 1, sqrt: 1, abs: 1, conj: 1, re: 1, im: 1
  };

  var LUTS = {};
  MAP_NAMES.forEach(function (name) {
    var bin = atob(MAP_SRC[name]);
    var lut = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) lut[i] = bin.charCodeAt(i);
    LUTS[name] = lut;
  });

  function fail(message) {
    var error = new Error(message);
    error.isParse = true;
    throw error;
  }

  function isDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  function isIdentStart(ch) {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }

  function isIdentChar(ch) {
    return isIdentStart(ch) || isDigit(ch);
  }

  function tokenize(src) {
    var tokens = [];
    var i = 0;
    var spaced = false;

    function push(token) {
      token.spaced = spaced;
      tokens.push(token);
      spaced = false;
    }

    function readNumber() {
      var s = "";
      if (src[i] === ".") s += src[i++];
      if (!isDigit(src[i]) && s === ".") fail("Expected a number");
      while (isDigit(src[i])) s += src[i++];
      if (src[i] === ".") {
        s += src[i++];
        while (isDigit(src[i])) s += src[i++];
      }
      if (src[i] === "e" || src[i] === "E") {
        var j = i + 1;
        var exp = "";
        if (src[j] === "+" || src[j] === "-") {
          exp += src[j];
          j++;
        }
        if (isDigit(src[j])) {
          s += src[i];
          s += exp;
          i = j;
          while (isDigit(src[i])) s += src[i++];
        }
      }
      var re = Number(s);
      var im = 0;
      if (!isFinite(re)) fail("Bad number");
      if (src[i] === "i" && !isIdentChar(src[i + 1])) {
        i++;
        im = re;
        re = 0;
      }
      return { type: "num", value: s, re: re, im: im };
    }

    while (i < src.length) {
      var ch = src[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        spaced = true;
        i++;
        continue;
      }
      if (ch === "(") { push({ type: "lparen", value: "(" }); i++; continue; }
      if (ch === ")") { push({ type: "rparen", value: ")" }); i++; continue; }
      if (ch === "+" || ch === "-" || ch === "/" || ch === "^") {
        push({ type: "op", value: ch });
        i++;
        continue;
      }
      if (ch === "*") {
        if (src[i + 1] === "*") { push({ type: "op", value: "**" }); i += 2; }
        else { push({ type: "op", value: "*" }); i++; }
        continue;
      }
      if (ch === "." || isDigit(ch)) {
        push(readNumber());
        continue;
      }
      if (isIdentStart(ch)) {
        var name = "";
        while (isIdentChar(src[i])) name += src[i++];
        push({ type: "ident", value: name });
        continue;
      }
      fail('Unexpected "' + ch + '"');
    }

    tokens.push({ type: "eof", value: "", spaced: false });
    return tokens;
  }

  function parse(src) {
    if (src == null || !String(src).trim()) return null;
    var tokens = tokenize(String(src));
    var p = 0;

    function peek() { return tokens[p]; }
    function previous() { return tokens[p - 1]; }
    function match(type, value) {
      var token = tokens[p];
      if (token.type !== type) return false;
      if (value !== undefined && token.value !== value) return false;
      p++;
      return true;
    }

    function parseExpr() {
      var left = parseTerm();
      while (match("op", "+") || match("op", "-")) {
        var op = previous().value;
        left = { type: "bin", op: op, left: left, right: parseTerm() };
      }
      return left;
    }

    function parseTerm() {
      var left = parseUnary();
      for (;;) {
        if (match("op", "*") || match("op", "/")) {
          var op = previous().value;
          left = { type: "bin", op: op, left: left, right: parseUnary() };
          continue;
        }
        if (implicitOk()) {
          left = { type: "bin", op: "*", left: left, right: parseUnary() };
          continue;
        }
        break;
      }
      return left;
    }

    /* `a c` multiplies. `ac` is one name. `2z` and `a(z)` multiply with or without a space. */
    function implicitOk() {
      var next = peek();
      if (next.type !== "num" && next.type !== "ident" && next.type !== "lparen") return false;
      var before = previous();
      if (!before) return false;
      if (before.type === "ident" && next.type === "ident" && !next.spaced) return false;
      return true;
    }

    function parseUnary() {
      if (match("op", "+")) return parseUnary();
      if (match("op", "-")) return { type: "neg", arg: parseUnary() };
      return parsePower();
    }

    function parsePower() {
      var base = parsePrimary();
      if (match("op", "^") || match("op", "**")) {
        return { type: "bin", op: "^", left: base, right: parseUnary() };
      }
      return base;
    }

    function parsePrimary() {
      var token = peek();
      if (token.type === "num") {
        p++;
        return { type: "num", re: token.re, im: token.im };
      }
      if (token.type === "ident") {
        p++;
        var name = token.value;
        if (FUNCS[name]) {
          if (!match("lparen")) fail(name + " needs parentheses");
          if (peek().type === "rparen") fail(name + " needs an argument");
          var arg = parseExpr();
          if (!match("rparen")) fail("Missing ) after " + name);
          return { type: "call", name: name, arg: arg };
        }
        if (name === "pi" || name === "e" || name === "i") return { type: "const", name: name };
        if (name === "z" || name === "c") return { type: "var", name: name };
        return { type: "param", name: name };
      }
      if (match("lparen")) {
        if (peek().type === "rparen") fail("Empty parentheses");
        var inner = parseExpr();
        if (!match("rparen")) fail("Missing )");
        return inner;
      }
      if (token.type === "eof") fail("Equation ended early");
      fail('Cannot read "' + token.value + '"');
    }

    var ast = parseExpr();
    if (peek().type !== "eof") fail('Unexpected "' + peek().value + '"');
    return ast;
  }

  function walk(node, fn) {
    if (!node) return;
    fn(node);
    if (node.arg) walk(node.arg, fn);
    if (node.left) walk(node.left, fn);
    if (node.right) walk(node.right, fn);
  }

  function lit(n) {
    if (Object.is(n, -0) || n === 0) return "0";
    if (n < 0) return "(" + n + ")";
    return String(n);
  }

  function realInt(node) {
    if (!node || node.type !== "num" || node.im !== 0) return null;
    if (!isFinite(node.re) || Math.abs(node.re) > 12) return null;
    if (Math.floor(node.re) !== node.re) return null;
    return node.re;
  }

  function compile(asts) {
    var names = [];
    var firstEq = {};
    asts.forEach(function (ast, index) {
      walk(ast, function (node) {
        if (node.type === "param" && firstEq[node.name] === undefined) {
          names.push(node.name);
          firstEq[node.name] = index;
        }
      });
    });

    var lines = [];
    var count = 0;
    function temp() { return "v" + (count++); }

    function add(left, right) {
      var re = temp();
      var im = temp();
      lines.push(re + " = " + left.re + " + " + right.re + ";");
      lines.push(im + " = " + left.im + " + " + right.im + ";");
      return { re: re, im: im };
    }

    function sub(left, right) {
      var re = temp();
      var im = temp();
      lines.push(re + " = " + left.re + " - " + right.re + ";");
      lines.push(im + " = " + left.im + " - " + right.im + ";");
      return { re: re, im: im };
    }

    function mul(left, right) {
      var re = temp();
      var im = temp();
      lines.push(re + " = " + left.re + " * " + right.re + " - " + left.im + " * " + right.im + ";");
      lines.push(im + " = " + left.re + " * " + right.im + " + " + left.im + " * " + right.re + ";");
      return { re: re, im: im };
    }

    function div(left, right) {
      var d = temp();
      var re = temp();
      var im = temp();
      lines.push(d + " = " + right.re + " * " + right.re + " + " + right.im + " * " + right.im + ";");
      lines.push(re + " = (" + left.re + " * " + right.re + " + " + left.im + " * " + right.im + ") / " + d + ";");
      lines.push(im + " = (" + left.im + " * " + right.re + " - " + left.re + " * " + right.im + ") / " + d + ";");
      return { re: re, im: im };
    }

    function emitCall(name, arg) {
      var re = temp();
      var im = temp();
      var ar = arg.re;
      var ai = arg.im;
      if (name === "sin") {
        lines.push(re + " = Math.sin(" + ar + ") * Math.cosh(" + ai + ");");
        lines.push(im + " = Math.cos(" + ar + ") * Math.sinh(" + ai + ");");
      } else if (name === "cos") {
        lines.push(re + " = Math.cos(" + ar + ") * Math.cosh(" + ai + ");");
        lines.push(im + " = -Math.sin(" + ar + ") * Math.sinh(" + ai + ");");
      } else if (name === "tan") {
        return div(emitCall("sin", arg), emitCall("cos", arg));
      } else if (name === "sinh") {
        lines.push(re + " = Math.sinh(" + ar + ") * Math.cos(" + ai + ");");
        lines.push(im + " = Math.cosh(" + ar + ") * Math.sin(" + ai + ");");
      } else if (name === "cosh") {
        lines.push(re + " = Math.cosh(" + ar + ") * Math.cos(" + ai + ");");
        lines.push(im + " = Math.sinh(" + ar + ") * Math.sin(" + ai + ");");
      } else if (name === "tanh") {
        return div(emitCall("sinh", arg), emitCall("cosh", arg));
      } else if (name === "exp") {
        var e = temp();
        lines.push(e + " = Math.exp(" + ar + ");");
        lines.push(re + " = " + e + " * Math.cos(" + ai + ");");
        lines.push(im + " = " + e + " * Math.sin(" + ai + ");");
      } else if (name === "log") {
        lines.push(re + " = 0.5 * Math.log(" + ar + " * " + ar + " + " + ai + " * " + ai + ");");
        lines.push(im + " = Math.atan2(" + ai + ", " + ar + ");");
      } else if (name === "sqrt") {
        var m = temp();
        lines.push(m + " = Math.hypot(" + ar + ", " + ai + ");");
        lines.push(re + " = Math.sqrt((" + m + " + " + ar + ") * 0.5);");
        lines.push(im + " = (" + ai + " < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (" + m + " - " + ar + ") * 0.5));");
      } else if (name === "abs") {
        lines.push(re + " = Math.hypot(" + ar + ", " + ai + ");");
        lines.push(im + " = 0;");
      } else if (name === "conj") {
        lines.push(re + " = " + ar + ";");
        lines.push(im + " = -(" + ai + ");");
      } else if (name === "re") {
        lines.push(re + " = " + ar + ";");
        lines.push(im + " = 0;");
      } else if (name === "im") {
        lines.push(re + " = " + ai + ";");
        lines.push(im + " = 0;");
      }
      return { re: re, im: im };
    }

    function emitIntPow(baseNode, k) {
      if (k === 0) return { re: "1", im: "0" };
      var neg = k < 0;
      var exp = Math.abs(k);
      var base = emit(baseNode);
      var result = null;
      while (exp > 0) {
        if (exp & 1) result = result ? mul(result, base) : base;
        exp >>= 1;
        if (exp) base = mul(base, base);
      }
      if (neg) result = div({ re: "1", im: "0" }, result);
      return result;
    }

    function emit(node) {
      if (node.type === "num") return { re: lit(node.re), im: lit(node.im) };
      if (node.type === "var") {
        if (node.name === "z") return { re: "zr", im: "zi" };
        return { re: "cr", im: "ci" };
      }
      if (node.type === "param") {
        return { re: "params[" + names.indexOf(node.name) + "]", im: "0" };
      }
      if (node.type === "const") {
        if (node.name === "pi") return { re: "Math.PI", im: "0" };
        if (node.name === "e") return { re: "Math.E", im: "0" };
        return { re: "0", im: "1" };
      }
      if (node.type === "neg") {
        var arg = emit(node.arg);
        var re = temp();
        var im = temp();
        lines.push(re + " = -(" + arg.re + ");");
        lines.push(im + " = -(" + arg.im + ");");
        return { re: re, im: im };
      }
      if (node.type === "call") return emitCall(node.name, emit(node.arg));
      if (node.type === "bin") {
        if (node.op === "^") {
          var k = realInt(node.right);
          if (k !== null) return emitIntPow(node.left, k);
          var base = emit(node.left);
          var exponent = emit(node.right);
          var logged = emitCall("log", base);
          return emitCall("exp", mul(exponent, logged));
        }
        var left = emit(node.left);
        var right = emit(node.right);
        if (node.op === "+") return add(left, right);
        if (node.op === "-") return sub(left, right);
        if (node.op === "*") return mul(left, right);
        return div(left, right);
      }
      fail("Could not compile this equation");
    }

    asts.forEach(function (ast) {
      if (!ast) return;
      var out = emit(ast);
      lines.push("zr = " + out.re + ";");
      lines.push("zi = " + out.im + ";");
    });

    var decls = [];
    for (var v = 0; v < count; v++) decls.push("v" + v + "=0");
    var decl = decls.length ? "let " + decls.join(",") + ";" : "";
    var body = lines.join("\n");

    var step = new Function(
      "return function(zr, zi, cr, ci, params) {\n" +
      decl + "\n" + body + "\nreturn [zr, zi];\n}"
    )();

    /* |z| > 4 ends the orbit. Smooth index assumes the square map's log doubling. */
    var fn = new Function(
      "return function(cr, ci, maxIter, params) {\n" +
      "let zr = 0, zi = 0;\n" +
      decl + "\n" +
      "for (let n = 0; n < maxIter; n++) {\n" +
      body + "\n" +
      "const mag = zr * zr + zi * zi;\n" +
      "if (!(mag <= 16)) {\n" +
      "if (!(mag > 16)) return n;\n" +
      "const mu = n + 1 - Math.log2(Math.log2(Math.sqrt(mag)));\n" +
      "return mu < 0 ? 0 : mu;\n" +
      "}\n" +
      "}\n" +
      "return -1;\n}"
    )();

    return { fn: fn, step: step, names: names, firstEq: firstEq };
  }

  function paramArray(names, paramMap) {
    return names.map(function (name) {
      if (paramMap && Object.prototype.hasOwnProperty.call(paramMap, name)) return paramMap[name];
      return 1;
    });
  }

  function step(src, zr, zi, cr, ci, paramMap) {
    var ast = parse(src);
    if (!ast) throw new Error("Empty equation");
    var compiled = compile([ast]);
    return compiled.step(zr, zi, cr, ci, paramArray(compiled.names, paramMap));
  }

  function iteratePoint(eqs, cr, ci, maxIter, paramMap) {
    var asts = eqs.map(function (src) {
      if (src == null || !String(src).trim()) return null;
      return parse(src);
    });
    var compiled = compile(asts);
    return compiled.fn(cr, ci, maxIter, paramArray(compiled.names, paramMap));
  }

  function colorAt(name, t) {
    var lut = LUTS[name];
    var idx = Math.max(0, Math.min(255, Math.round(t * 255)));
    var o = idx * 3;
    return [lut[o], lut[o + 1], lut[o + 2]];
  }

  function mount() {
    var openBtn = document.getElementById("open-fractal");
    var overlay = document.getElementById("fractal");
    if (!openBtn || !overlay) return;

    var eqHost = document.getElementById("fractal-eqs");
    var addBtn = document.getElementById("fractal-add");
    var resetBtn = document.getElementById("fractal-reset");
    var closeBtn = document.getElementById("fractal-close");
    var iterRange = document.getElementById("fractal-iter");
    var iterNum = document.getElementById("fractal-iter-num");
    var resSelect = document.getElementById("fractal-res");
    var cmapSelect = document.getElementById("fractal-cmap");
    var swatch = document.getElementById("fractal-swatch");
    var stage = document.getElementById("fractal-stage");
    var canvas = document.getElementById("fractal-canvas");
    var statusEl = document.getElementById("fractal-status");
    var ctx = canvas.getContext("2d", { alpha: true });

    var equations = ["z^2 + c"];
    var params = {};
    var iterations = 80;
    var resolution = 480;
    var colormap = "viridis";
    var isOpen = false;
    var pointer = null;
    var holdPaint = false;
    var previewDx = 0;
    var previewDy = 0;
    var view = { centerRe: -0.75, centerIm: 0, height: 2.5 };
    var compiled = null;
    var frame = null;
    var revision = 0;
    var imageData = null;
    var job = 0;
    var parseTimer = 0;
    var sliderSig = "";
    var renderQueued = false;
    var lastFocus = null;

    MAP_NAMES.forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === colormap) option.selected = true;
      cmapSelect.appendChild(option);
    });

    function setStatus(text) { statusEl.textContent = text; }

    function swatchOf(name) {
      var lut = LUTS[name];
      var stops = [];
      for (var i = 0; i < 8; i++) {
        var j = Math.round(i * 255 / 7) * 3;
        stops.push("rgb(" + lut[j] + "," + lut[j + 1] + "," + lut[j + 2] + ")");
      }
      return "linear-gradient(to right, " + stops.join(",") + ")";
    }

    function updateSwatch() { swatch.style.background = swatchOf(colormap); }

    function formatNum(value) {
      if (!isFinite(value)) return "";
      return String(Math.round(value * 10000) / 10000);
    }

    function renderRows() {
      eqHost.innerHTML = "";
      equations.forEach(function (src, index) {
        var row = document.createElement("div");
        row.className = "fractal-eq";
        var head = document.createElement("div");
        head.className = "fractal-eq-head";
        var label = document.createElement("label");
        label.htmlFor = "fractal-eq-" + index;
        label.textContent = "Eq " + (index + 1);
        head.appendChild(label);
        if (index > 0) {
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "fractal-eq-remove";
          remove.dataset.removeEq = String(index);
          remove.textContent = "Remove";
          head.appendChild(remove);
        }
        var input = document.createElement("input");
        input.id = "fractal-eq-" + index;
        input.className = "fractal-eq-input";
        input.type = "text";
        input.spellcheck = false;
        input.autocomplete = "off";
        input.autocapitalize = "off";
        input.setAttribute("autocorrect", "off");
        input.dataset.eq = String(index);
        input.value = src;
        if (index > 0) input.placeholder = "optional, runs after Eq " + index;
        var error = document.createElement("p");
        error.className = "fractal-error";
        error.dataset.error = String(index);
        var slot = document.createElement("div");
        slot.className = "fractal-eq-params";
        slot.dataset.params = String(index);
        row.appendChild(head);
        row.appendChild(input);
        row.appendChild(error);
        row.appendChild(slot);
        eqHost.appendChild(row);
      });
      addBtn.disabled = equations.length >= 4;
      sliderSig = "";
    }

    function showErrors(messages) {
      eqHost.querySelectorAll("[data-error]").forEach(function (el) {
        el.textContent = messages[Number(el.dataset.error)] || "";
      });
    }

    function sliderSignature() {
      if (!compiled) return "";
      return compiled.names.map(function (name) {
        return name + ":" + (params[name].slider ? "1" : "0") + ":" + compiled.firstEq[name];
      }).join("|");
    }

    function buildSliders() {
      eqHost.querySelectorAll(".fractal-eq-params").forEach(function (slot) { slot.innerHTML = ""; });
      if (!compiled) return;
      compiled.names.forEach(function (name) {
        var slot = eqHost.querySelector('[data-params="' + compiled.firstEq[name] + '"]');
        if (!slot) return;
        var block = document.createElement("div");
        block.className = "fractal-param";
        var record = params[name];
        if (!record.slider) {
          block.classList.add("is-offer");
          var offerName = document.createElement("span");
          offerName.className = "fractal-param-name";
          offerName.textContent = name;
          var add = document.createElement("button");
          add.type = "button";
          add.className = "fractal-add-slider";
          add.dataset.addSlider = name;
          add.textContent = "Add slider";
          block.appendChild(offerName);
          block.appendChild(add);
        } else {
          var top = document.createElement("div");
          top.className = "fractal-param-top";
          var nameEl = document.createElement("span");
          nameEl.className = "fractal-param-name";
          nameEl.textContent = name;
          var range = document.createElement("input");
          range.type = "range";
          range.min = String(record.min);
          range.max = String(record.max);
          range.step = "any";
          range.value = String(record.value);
          range.dataset.paramRange = name;
          range.setAttribute("aria-label", name);
          var number = document.createElement("input");
          number.type = "number";
          number.className = "fractal-param-num";
          number.step = "any";
          number.value = formatNum(record.value);
          number.dataset.paramValue = name;
          number.setAttribute("aria-label", name + " value");
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "fractal-remove-slider";
          remove.dataset.removeSlider = name;
          remove.textContent = "Remove";
          top.appendChild(nameEl);
          top.appendChild(range);
          top.appendChild(number);
          top.appendChild(remove);
          var limits = document.createElement("div");
          limits.className = "fractal-param-limits";
          limits.appendChild(limitField("min", name, record.min));
          limits.appendChild(limitField("max", name, record.max));
          block.appendChild(top);
          block.appendChild(limits);
        }
        slot.appendChild(block);
      });
      sliderSig = sliderSignature();
    }

    function limitField(which, name, value) {
      var label = document.createElement("label");
      label.textContent = which + " ";
      var input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.value = formatNum(value);
      input.dataset[which === "min" ? "paramMin" : "paramMax"] = name;
      input.setAttribute("aria-label", name + " " + which);
      label.appendChild(input);
      return label;
    }

    function syncSliderSignature() {
      var next = sliderSignature();
      if (next !== sliderSig) buildSliders();
    }

    function clampRecord(record) {
      if (!(record.max > record.min)) record.max = record.min + 1;
      if (record.value < record.min) record.value = record.min;
      if (record.value > record.max) record.value = record.max;
    }

    function commitEquations() {
      var messages = [];
      var asts = [];
      var bad = false;
      equations.forEach(function (src, index) {
        var text = src.trim();
        if (!text) {
          if (index === 0) {
            messages[0] = "Enter an equation.";
            bad = true;
          }
          asts.push(null);
          return;
        }
        try {
          asts.push(parse(text));
          messages[index] = "";
        } catch (error) {
          messages[index] = error.message || "Could not read this equation";
          bad = true;
          asts.push(null);
        }
      });
      showErrors(messages);
      if (bad) {
        setStatus("Fix the equation to draw");
        return;
      }
      var nextCompiled = compile(asts);
      var nextParams = {};
      nextCompiled.names.forEach(function (name) {
        nextParams[name] = params[name] || { value: 1, min: -2, max: 2, slider: false };
      });
      compiled = nextCompiled;
      params = nextParams;
      revision++;
      syncSliderSignature();
      requestRender();
    }

    function scheduleParse() {
      clearTimeout(parseTimer);
      parseTimer = setTimeout(commitEquations, 280);
    };

    function measure() {
      var rect = stage.getBoundingClientRect();
      if (!(rect.width > 8) || !(rect.height > 8)) return null;
      var w = resolution;
      var h = Math.max(2, Math.round(w * rect.height / rect.width));
      return { w: w, h: h };
    }

    function orbitKey(size) {
      var values = compiled.names.map(function (name) { return params[name].value; }).join(",");
      return [
        revision,
        values,
        iterations,
        size.w,
        size.h,
        view.centerRe,
        view.centerIm,
        view.height
      ].join("|");
    }

    function paint(samples, w, h, filled) {
      if (!imageData || imageData.width !== w || imageData.height !== h) {
        canvas.width = w;
        canvas.height = h;
        imageData = ctx.createImageData(w, h);
      }
      var data = imageData.data;
      var lut = LUTS[colormap];
      var scale = 256 / iterations;
      var n = filled * w;
      for (var i = 0; i < n; i++) {
        var v = samples[i];
        var o = i << 2;
        if (v < 0) {
          data[o] = 0;
          data[o + 1] = 0;
          data[o + 2] = 0;
          data[o + 3] = 255;
        } else {
          var idx = (v * scale) | 0;
          if (idx < 0) idx = 0;
          else if (idx > 255) idx = 255;
          var c = idx * 3;
          data[o] = lut[c];
          data[o + 1] = lut[c + 1];
          data[o + 2] = lut[c + 2];
          data[o + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      var box = stage.getBoundingClientRect();
      canvas.classList.toggle("is-pixelated", w < box.width - 1 || h < box.height - 1);
    }

    function readyText(size) {
      return iterations + " iter · " + size.w + "×" + size.h + " · " + colormap;
    }

    function draw() {
      if (!isOpen || !compiled) return;
      if (pointer) return;
      var size = measure();
      if (!size) return;
      var key = orbitKey(size);
      var defer = holdPaint;
      if (frame && frame.key === key) {
        settlePreview();
        holdPaint = false;
        paint(frame.samples, size.w, size.h, size.h);
        setStatus(readyText(size));
        return;
      }
      var my = ++job;
      var samples = new Float32Array(size.w * size.h);
      var paramValues = compiled.names.map(function (name) { return params[name].value; });
      var fn = compiled.fn;
      var viewW = view.height * (size.w / size.h);
      var re0 = view.centerRe - viewW / 2;
      var imTop = view.centerIm + view.height / 2;
      var dre = viewW / size.w;
      var dim = view.height / size.h;
      var maxIter = iterations;
      if (!defer) {
        if (imageData && imageData.width === size.w && imageData.height === size.h) {
          imageData.data.fill(0);
          ctx.putImageData(imageData, 0, 0);
        } else {
          canvas.width = size.w;
          canvas.height = size.h;
          imageData = ctx.createImageData(size.w, size.h);
        }
      }
      setStatus("Drawing…");
      var y = 0;

      function chunk() {
        if (my !== job) return;
        var start = performance.now();
        while (y < size.h && performance.now() - start < 14) {
          var ci = imTop - (y + 0.5) * dim;
          var cr = re0 + 0.5 * dre;
          var row = y * size.w;
          for (var x = 0; x < size.w; x++, cr += dre) {
            samples[row + x] = fn(cr, ci, maxIter, paramValues);
          }
          y++;
        }
        if (my !== job || pointer) return;
        if (y < size.h) {
          if (!defer) paint(samples, size.w, size.h, y);
          setStatus("Drawing " + Math.round(100 * y / size.h) + "%");
          requestAnimationFrame(chunk);
          return;
        }
        frame = { samples: samples, key: key, w: size.w, h: size.h };
        settlePreview();
        holdPaint = false;
        paint(samples, size.w, size.h, size.h);
        setStatus(readyText(size));
      }

      requestAnimationFrame(chunk);
    }

    function requestRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(function () {
        renderQueued = false;
        draw();
      });
    }

    function clampHeight() {
      if (view.height < 1e-14) view.height = 1e-14;
      if (view.height > 1e6) view.height = 1e6;
    }

    function isDesktop() {
      return window.matchMedia("(min-width: 800px)").matches;
    }

    function contentBox() {
      var rect = stage.getBoundingClientRect();
      return {
        left: rect.left + stage.clientLeft,
        top: rect.top + stage.clientTop,
        width: stage.clientWidth,
        height: stage.clientHeight
      };
    }

    function shiftView(dx, dy) {
      var box = contentBox();
      if (!(box.height > 0)) return;
      var scale = view.height / box.height;
      view.centerRe -= dx * scale;
      view.centerIm += dy * scale;
    }

    function centerAt(clientX, clientY) {
      var box = contentBox();
      var size = measure();
      if (!size || !(box.width > 0) || !(box.height > 0)) return;
      var x = (clientX - box.left) / box.width;
      var y = (clientY - box.top) / box.height;
      var viewW = view.height * (size.w / size.h);
      view.centerRe += (x - 0.5) * viewW;
      view.centerIm -= (y - 0.5) * view.height;
      requestRender();
    }

    function showPreview() {
      var dx = previewDx;
      var dy = previewDy;
      if (pointer && pointer.moved) {
        dx += pointer.dx;
        dy += pointer.dy;
      }
      canvas.style.transform = (dx === 0 && dy === 0) ? "" : "translate(" + dx + "px," + dy + "px)";
    }

    function settlePreview() {
      previewDx = 0;
      previewDy = 0;
      canvas.style.transform = "";
      stage.classList.remove("is-dragging");
    }

    function onPointerMove(event) {
      if (!pointer) return;
      pointer.dx = event.clientX - pointer.x;
      pointer.dy = event.clientY - pointer.y;
      if (!pointer.moved && Math.hypot(pointer.dx, pointer.dy) >= 4) {
        pointer.moved = true;
        stage.classList.add("is-dragging");
      }
      if (pointer.moved) showPreview();
    }

    function onPointerUp(event) {
      if (!pointer) return;
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      var drag = pointer;
      pointer = null;
      stage.classList.remove("is-dragging");
      if (drag.moved) {
        job++;
        previewDx += drag.dx;
        previewDy += drag.dy;
        shiftView(drag.dx, drag.dy);
        showPreview();
        holdPaint = true;
        requestRender();
        return;
      }
      settlePreview();
      holdPaint = false;
      centerAt(event.clientX, event.clientY);
    }

    function onPointerDown(event) {
      if (!isOpen || event.button !== 0) return;
      var active = document.activeElement;
      if (active && overlay.contains(active) && active.matches("input, select, textarea") && active.blur) active.blur();
      event.preventDefault();
      job++;
      pointer = { x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    }

    function onWheel(event) {
      if (!isOpen) return;
      if (event.ctrlKey) return;
      event.preventDefault();
      if (pointer) return;
      job++;
      settlePreview();
      holdPaint = false;
      var dy = event.deltaY;
      if (event.shiftKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) dy = event.deltaX;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= 400;
      var base = event.shiftKey ? 1.04 : 1.18;
      var factor = Math.pow(base, dy / 100);
      if (!(factor > 0)) return;
      if (factor < 0.5) factor = 0.5;
      if (factor > 2) factor = 2;
      view.height *= factor;
      clampHeight();
      requestRender();
    }

    function resetView() {
      view.centerRe = -0.75;
      view.centerIm = 0;
      view.height = 2.5;
      requestRender();
    }

    function openStudio(pushHash) {
      if (!isDesktop()) return;
      if (isOpen) return;
      lastFocus = document.activeElement;
      isOpen = true;
      overlay.classList.add("is-open");
      overlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (pushHash !== false && location.hash !== "#generator") {
        history.replaceState(null, "", "#generator");
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          overlay.focus();
          requestRender();
        });
      });
    }

    function closeStudio() {
      if (!isOpen) return;
      isOpen = false;
      job++;
      pointer = null;
      holdPaint = false;
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      settlePreview();
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (location.hash === "#generator") {
        history.replaceState(null, "", location.pathname + location.search);
      }
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    openBtn.addEventListener("click", function () { openStudio(true); });
    closeBtn.addEventListener("click", closeStudio);
    resetBtn.addEventListener("click", resetView);

    addBtn.addEventListener("click", function () {
      if (equations.length >= 4) return;
      equations.push("");
      renderRows();
      commitEquations();
      var created = eqHost.querySelector('[data-eq="' + (equations.length - 1) + '"]');
      if (created) created.focus();
    });

    eqHost.addEventListener("input", function (event) {
      var input = event.target;
      if (input.dataset.eq !== undefined) {
        equations[Number(input.dataset.eq)] = input.value;
        scheduleParse();
        return;
      }
      if (input.dataset.paramRange) {
        var ranged = params[input.dataset.paramRange];
        ranged.value = Number(input.value);
        var readout = eqHost.querySelector('[data-param-value="' + input.dataset.paramRange + '"]');
        if (readout && document.activeElement !== readout) readout.value = formatNum(ranged.value);
        requestRender();
        return;
      }
      if (input.dataset.paramValue) {
        var typed = Number(input.value);
        if (!isFinite(typed)) return;
        var record = params[input.dataset.paramValue];
        record.value = Math.min(record.max, Math.max(record.min, typed));
        var range = eqHost.querySelector('[data-param-range="' + input.dataset.paramValue + '"]');
        if (range) range.value = String(record.value);
        requestRender();
      }
    });

    function refreshSlider(name) {
      var record = params[name];
      clampRecord(record);
      var range = eqHost.querySelector('[data-param-range="' + name + '"]');
      var number = eqHost.querySelector('[data-param-value="' + name + '"]');
      var minInput = eqHost.querySelector('[data-param-min="' + name + '"]');
      var maxInput = eqHost.querySelector('[data-param-max="' + name + '"]');
      if (range) {
        range.min = String(record.min);
        range.max = String(record.max);
        range.value = String(record.value);
      }
      if (number && document.activeElement !== number) number.value = formatNum(record.value);
      if (minInput && document.activeElement !== minInput) minInput.value = formatNum(record.min);
      if (maxInput && document.activeElement !== maxInput) maxInput.value = formatNum(record.max);
    }

    eqHost.addEventListener("focusout", function (event) {
      var input = event.target;
      var name = input.dataset.paramMin || input.dataset.paramMax || input.dataset.paramValue;
      if (!name || !params[name]) return;
      var record = params[name];
      if (input.dataset.paramMin) {
        var nextMin = Number(input.value);
        if (isFinite(nextMin)) record.min = nextMin;
      } else if (input.dataset.paramMax) {
        var nextMax = Number(input.value);
        if (isFinite(nextMax)) record.max = nextMax;
      }
      refreshSlider(name);
      requestRender();
    });

    eqHost.addEventListener("click", function (event) {
      var add = event.target.closest("[data-add-slider]");
      if (add) {
        params[add.dataset.addSlider].slider = true;
        buildSliders();
        return;
      }
      var removeSlider = event.target.closest("[data-remove-slider]");
      if (removeSlider) {
        params[removeSlider.dataset.removeSlider].slider = false;
        buildSliders();
        return;
      }
      var removeEq = event.target.closest("[data-remove-eq]");
      if (removeEq) {
        equations.splice(Number(removeEq.dataset.removeEq), 1);
        clearTimeout(parseTimer);
        renderRows();
        commitEquations();
      }
    });

    function readIterations(value) {
      var n = Math.round(Number(value));
      if (!isFinite(n)) n = iterations;
      if (n < 1) n = 1;
      if (n > 500) n = 500;
      iterations = n;
      iterRange.value = String(n);
      if (document.activeElement !== iterNum) iterNum.value = String(n);
    }

    iterRange.addEventListener("input", function () {
      readIterations(iterRange.value);
      requestRender();
    });
    iterNum.addEventListener("input", function () {
      if (iterNum.value === "") return;
      readIterations(iterNum.value);
      requestRender();
    });
    iterNum.addEventListener("change", function () {
      readIterations(iterNum.value);
      iterNum.value = String(iterations);
      requestRender();
    });

    resSelect.addEventListener("change", function () {
      resolution = Number(resSelect.value) || 480;
      requestRender();
    });

    cmapSelect.addEventListener("change", function () {
      colormap = cmapSelect.value;
      updateSwatch();
      if (frame) {
        var size = measure();
        if (size) {
          paint(frame.samples, frame.w, frame.h, frame.h);
          setStatus(readyText(size));
        }
      }
    });

    canvas.addEventListener("mousedown", onPointerDown);
    stage.addEventListener("wheel", onWheel, { passive: false });

    document.addEventListener("keydown", function (event) {
      if (!isOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeStudio();
      }
    });

    if (typeof ResizeObserver !== "undefined") {
      var observer = new ResizeObserver(function () {
        if (isOpen) requestRender();
      });
      observer.observe(stage);
    }

    var desktopQuery = window.matchMedia("(min-width: 800px)");
    function onDesktopChange(event) {
      if (!event.matches) closeStudio();
    }
    if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", onDesktopChange);
    else desktopQuery.addListener(onDesktopChange);

    renderRows();
    updateSwatch();
    commitEquations();
    if (location.hash === "#generator") openStudio(false);
  }

  var api = { parse: parse, compile: compile, step: step, iteratePoint: iteratePoint, colorAt: colorAt, mount: mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Fractal = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})();
