/* Gastos — control mensual de gastos e ingresos. Sin dependencias, persistencia en localStorage. */
(function () {
  "use strict";

  var STORAGE_KEY = "gastos.v1";
  var CURRENCY = "EUR";
  var LOCALE = "es-ES";

  var money = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, maximumFractionDigits: 2 });
  var moneyCompact = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 });
  var monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
  var monthShortFmt = new Intl.DateTimeFormat(LOCALE, { month: "short" });
  var dayFmt = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short" });

  // Colores por categoría de gasto. Las no listadas reciben un color estable por hash.
  var EXPENSE_COLORS = {
    "comida": "#4f46e5", "transporte": "#0ea5a4", "vivienda": "#f59e0b",
    "ocio": "#ec4899", "salud": "#10b981", "compras": "#8b5cf6",
    "servicios": "#3b82f6", "educación": "#f97316", "otros": "#94a3b8",
  };
  // Colores por categoría de ingreso (familia verde/teal).
  var INCOME_COLORS = {
    "nómina": "#1f9d63", "freelance": "#0d9488", "ventas": "#16a34a",
    "reembolso": "#84cc16", "intereses": "#0891b2", "inversiones": "#059669",
    "regalo": "#7c3aed", "otros ingresos": "#64748b",
  };
  var FALLBACK_PALETTE = [
    "#6366f1", "#14b8a6", "#f43f5e", "#22c55e", "#eab308",
    "#a855f7", "#0891b2", "#fb7185", "#84cc16", "#f97316",
  ];
  var DEFAULT_EXPENSE_CATS = Object.keys(EXPENSE_COLORS);
  var DEFAULT_INCOME_CATS = Object.keys(INCOME_COLORS);

  // ---------- estado ----------
  var state = { entries: [] };
  var view = { month: monthKey(new Date()), filter: null, formType: "expense" };

  // ---------- utilidades ----------
  function monthKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseMonthKey(key) {
    var p = key.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, 1);
  }
  function shiftMonth(key, delta) {
    var d = parseMonthKey(key);
    d.setMonth(d.getMonth() + delta);
    return monthKey(d);
  }
  function daysInMonth(key) {
    var d = parseMonthKey(key);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  function normCat(name) {
    return String(name || "").trim().toLowerCase();
  }
  function colorFor(cat) {
    var key = normCat(cat);
    if (EXPENSE_COLORS[key]) return EXPENSE_COLORS[key];
    if (INCOME_COLORS[key]) return INCOME_COLORS[key];
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
  }
  function titleCase(s) {
    s = String(s || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  // Interpreta importes en formato es-ES y variantes: "15,50", "15.50",
  // "1.800", "1.234,56", "1,234.56", "12,50 €"...  Coma = decimal por defecto;
  // un punto seguido de exactamente 3 dígitos se toma como separador de miles.
  function parseAmount(raw) {
    var s = String(raw == null ? "" : raw).trim().replace(/[^\d.,-]/g, "");
    if (!s) return NaN;
    var hasComma = s.indexOf(",") > -1;
    var hasDot = s.indexOf(".") > -1;
    if (hasComma && hasDot) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");   // 1.234,56
      } else {
        s = s.replace(/,/g, "");                       // 1,234.56
      }
    } else if (hasComma) {
      var cp = s.split(",");
      s = cp.slice(0, -1).join("") + "." + cp[cp.length - 1];
    } else if (hasDot) {
      var dp = s.split(".");
      if (dp.length > 2 || dp[dp.length - 1].length === 3) {
        s = dp.join("");                               // 1.800  ·  1.200.000
      }
    }
    return parseFloat(s);
  }

  // ---------- persistencia ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      // Compatibilidad: v1 guardaba en `expenses` sin campo `type`.
      var listRaw = data && (Array.isArray(data.entries) ? data.entries
        : Array.isArray(data.expenses) ? data.expenses : null);
      if (!listRaw) return;
      state.entries = listRaw.filter(isValidEntry).map(function (e) {
        return {
          id: String(e.id || uid()),
          type: e.type === "income" ? "income" : "expense",
          amount: Number(e.amount),
          category: normCat(e.category) || (e.type === "income" ? "otros ingresos" : "otros"),
          note: String(e.note || "").slice(0, 80),
          date: e.date,
        };
      });
    } catch (err) {
      console.warn("No se pudo leer localStorage:", err);
    }
  }
  function isValidEntry(e) {
    return e && isFinite(Number(e.amount)) && Number(e.amount) > 0 &&
      typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, entries: state.entries }));
    } catch (err) {
      console.warn("No se pudo escribir en localStorage:", err);
    }
  }

  // ---------- selecciones ----------
  function entriesForMonth(key) {
    return state.entries.filter(function (e) { return e.date.slice(0, 7) === key; });
  }
  function ofType(list, type) {
    return list.filter(function (e) { return e.type === type; });
  }
  function totalsByCategory(list) {
    var map = {};
    list.forEach(function (e) { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.keys(map).map(function (cat) { return { category: cat, total: map[cat] }; })
      .sort(function (a, b) { return b.total - a.total; });
  }
  function sum(list) {
    return list.reduce(function (acc, e) { return acc + e.amount; }, 0);
  }

  // ---------- render ----------
  var el = {};
  function cache() {
    [
      "prevMonth", "nextMonth", "monthLabel",
      "statIncome", "statIncomeHint", "statExpense", "statExpenseHint",
      "statBalance", "statBalanceHint", "statTopCat", "statTopCatShare",
      "donut", "donutCenter", "donutTotalNote", "legend",
      "bars", "barsNote",
      "balance", "balanceNote",
      "expenseForm", "typeToggle", "amount", "category", "note", "date", "categoryList",
      "submitBtn", "amountLabel",
      "filters", "expenseRows", "emptyState", "listCount",
      "exportBtn", "clearBtn",
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function render() {
    var monthList = entriesForMonth(view.month);
    var expenseList = ofType(monthList, "expense");
    var filtered = view.filter
      ? monthList.filter(function (e) { return e.category === view.filter; })
      : monthList;

    renderMonthLabel();
    renderStats(monthList, expenseList);
    renderDonut(expenseList);
    renderBars(expenseList);
    renderBalanceChart();
    renderCategoryDatalist();
    renderFilters(monthList);
    renderTable(filtered);
  }

  function renderMonthLabel() {
    el.monthLabel.textContent = titleCase(monthFmt.format(parseMonthKey(view.month)));
    var atLimit = view.month >= monthKey(new Date());
    el.nextMonth.disabled = atLimit;
    el.nextMonth.style.opacity = atLimit ? 0.35 : 1;
    el.nextMonth.style.cursor = atLimit ? "default" : "pointer";
  }

  function renderStats(monthList, expenseList) {
    var incomeList = ofType(monthList, "income");
    var income = sum(incomeList);
    var expense = sum(expenseList);
    var balance = income - expense;

    el.statIncome.textContent = money.format(income);
    el.statIncomeHint.textContent = incomeList.length
      ? incomeList.length + (incomeList.length === 1 ? " movimiento" : " movimientos")
      : "sin ingresos este mes";

    el.statExpense.textContent = money.format(expense);

    // comparación de gasto con el mes anterior
    var prevExpense = sum(ofType(entriesForMonth(shiftMonth(view.month, -1)), "expense"));
    if (prevExpense > 0) {
      var diff = expense - prevExpense;
      var pct = Math.round((diff / prevExpense) * 100);
      el.statExpenseHint.textContent = (diff >= 0 ? "▲ " : "▼ ") + Math.abs(pct) + "% vs. mes anterior";
      el.statExpenseHint.className = "stat-hint " + (diff > 0 ? "up" : diff < 0 ? "down" : "");
    } else {
      el.statExpenseHint.textContent = expenseList.length ? "sin gasto el mes anterior" : "sin gastos este mes";
      el.statExpenseHint.className = "stat-hint";
    }

    el.statBalance.textContent = (balance > 0 ? "+" : "") + money.format(balance);
    el.statBalance.className = "stat-val " + (balance > 0 ? "pos" : balance < 0 ? "neg" : "");

    // media diaria de gasto sobre días transcurridos
    var now = new Date();
    var elapsed;
    if (view.month === monthKey(now)) elapsed = now.getDate();
    else if (view.month < monthKey(now)) elapsed = daysInMonth(view.month);
    else elapsed = 1;
    el.statBalanceHint.textContent = expense
      ? "gasto medio " + money.format(expense / elapsed) + "/día"
      : "";

    var byCat = totalsByCategory(expenseList);
    if (byCat.length) {
      el.statTopCat.textContent = titleCase(byCat[0].category);
      el.statTopCatShare.textContent = Math.round((byCat[0].total / expense) * 100) + "% del gasto";
    } else {
      el.statTopCat.textContent = "—";
      el.statTopCatShare.textContent = "";
    }
  }

  function renderDonut(expenseList) {
    var byCat = totalsByCategory(expenseList);
    var total = sum(expenseList);
    var svg = el.donut;
    svg.innerHTML = "";
    var NS = "http://www.w3.org/2000/svg";
    var cx = 100, cy = 100, r = 78, circ = 2 * Math.PI * r;

    var track = document.createElementNS(NS, "circle");
    track.setAttribute("cx", cx); track.setAttribute("cy", cy); track.setAttribute("r", r);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "var(--border)");
    track.setAttribute("stroke-width", "22");
    svg.appendChild(track);

    el.donutCenter.textContent = total ? moneyCompact.format(total) : money.format(0);
    el.donutTotalNote.textContent = byCat.length ? byCat.length + (byCat.length === 1 ? " categoría" : " categorías") : "";

    if (total > 0) {
      var offset = 0;
      byCat.forEach(function (row) {
        var frac = row.total / total;
        var seg = document.createElementNS(NS, "circle");
        seg.setAttribute("cx", cx); seg.setAttribute("cy", cy); seg.setAttribute("r", r);
        seg.setAttribute("fill", "none");
        seg.setAttribute("stroke", colorFor(row.category));
        seg.setAttribute("stroke-width", "22");
        seg.setAttribute("stroke-dasharray", (frac * circ) + " " + circ);
        seg.setAttribute("stroke-dashoffset", -offset);
        seg.setAttribute("stroke-linecap", "butt");
        var t = document.createElementNS(NS, "title");
        t.textContent = titleCase(row.category) + " · " + money.format(row.total) + " (" + Math.round(frac * 100) + "%)";
        seg.appendChild(t);
        svg.appendChild(seg);
        offset += frac * circ;
      });
    }

    el.legend.innerHTML = "";
    if (!byCat.length) {
      var li0 = document.createElement("li");
      li0.innerHTML = '<span class="empty-legend">Aún no hay gastos este mes.</span>';
      el.legend.appendChild(li0);
      return;
    }
    byCat.forEach(function (row) {
      var li = document.createElement("li");
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = colorFor(row.category);
      var lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = titleCase(row.category) + " · " + Math.round((row.total / total) * 100) + "%";
      var amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = money.format(row.total);
      li.appendChild(dot); li.appendChild(lbl); li.appendChild(amt);
      el.legend.appendChild(li);
    });
  }

  function renderBars(expenseList) {
    var svg = el.bars;
    svg.innerHTML = "";
    var NS = "http://www.w3.org/2000/svg";
    var W = 520, H = 220, padL = 8, padR = 8, padT = 12;
    var n = daysInMonth(view.month);
    var totals = new Array(n).fill(0);
    expenseList.forEach(function (e) {
      var day = Number(e.date.slice(8, 10));
      if (day >= 1 && day <= n) totals[day - 1] += e.amount;
    });
    var max = Math.max.apply(null, totals);
    el.barsNote.textContent = max > 0 ? "máx. " + money.format(max) : "";

    if (max <= 0) {
      var txt = document.createElementNS(NS, "text");
      txt.setAttribute("x", W / 2); txt.setAttribute("y", H / 2);
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("fill", "var(--text-faint)");
      txt.textContent = "Sin gastos este mes";
      svg.appendChild(txt);
      return;
    }

    var plotW = W - padL - padR;
    var plotH = H - padT - 26;
    var gap = 2;
    var bw = (plotW - gap * (n - 1)) / n;
    var todayDay = (view.month === monthKey(new Date())) ? new Date().getDate() : -1;

    var axis = document.createElementNS(NS, "line");
    axis.setAttribute("class", "axis");
    axis.setAttribute("x1", padL); axis.setAttribute("y1", padT + plotH);
    axis.setAttribute("x2", W - padR); axis.setAttribute("y2", padT + plotH);
    svg.appendChild(axis);

    totals.forEach(function (v, i) {
      var h = v > 0 ? Math.max(2, (v / max) * plotH) : 0;
      var x = padL + i * (bw + gap);
      if (h > 0) {
        var rect = document.createElementNS(NS, "rect");
        rect.setAttribute("class", "bar");
        rect.setAttribute("x", x);
        rect.setAttribute("y", padT + plotH - h);
        rect.setAttribute("width", Math.max(1, bw));
        rect.setAttribute("height", h);
        rect.setAttribute("rx", Math.min(2, bw / 2));
        rect.setAttribute("fill", (i + 1) === todayDay ? "var(--accent)" : "var(--accent-soft)");
        rect.setAttribute("stroke", "var(--accent)");
        rect.setAttribute("stroke-width", (i + 1) === todayDay ? "0" : "1");
        var tt = document.createElementNS(NS, "title");
        tt.textContent = "Día " + (i + 1) + " · " + money.format(v);
        rect.appendChild(tt);
        svg.appendChild(rect);
      }
      if ((i + 1) % 5 === 0 || i === 0 || i === n - 1) {
        var label = document.createElementNS(NS, "text");
        label.setAttribute("x", x + bw / 2);
        label.setAttribute("y", H - 8);
        label.setAttribute("text-anchor", "middle");
        label.textContent = String(i + 1);
        svg.appendChild(label);
      }
    });
  }

  function renderBalanceChart() {
    var svg = el.balance;
    svg.innerHTML = "";
    var NS = "http://www.w3.org/2000/svg";
    var W = 720, H = 240, padX = 16, padT = 22, padB = 40;
    var months = [];
    for (var k = 5; k >= 0; k--) months.push(shiftMonth(view.month, -k));

    var data = months.map(function (m) {
      var list = entriesForMonth(m);
      var inc = sum(ofType(list, "income"));
      var exp = sum(ofType(list, "expense"));
      return { month: m, income: inc, expense: exp, net: inc - exp };
    });
    var maxAbs = Math.max.apply(null, data.map(function (d) { return Math.abs(d.net); }).concat([1]));

    var hasAny = data.some(function (d) { return d.income || d.expense; });
    if (!hasAny) {
      var t0 = document.createElementNS(NS, "text");
      t0.setAttribute("x", W / 2); t0.setAttribute("y", H / 2);
      t0.setAttribute("text-anchor", "middle");
      t0.setAttribute("fill", "var(--text-faint)");
      t0.textContent = "Sin movimientos en los últimos 6 meses";
      svg.appendChild(t0);
      el.balanceNote.textContent = "";
      return;
    }
    el.balanceNote.textContent = "ingreso − gasto · últimos 6 meses";

    var plotW = W - padX * 2;
    var plotH = H - padT - padB;
    var zeroY = padT + plotH / 2;
    var slot = plotW / data.length;
    var bw = Math.min(66, slot * 0.5);

    var zero = document.createElementNS(NS, "line");
    zero.setAttribute("class", "axis");
    zero.setAttribute("x1", padX); zero.setAttribute("y1", zeroY);
    zero.setAttribute("x2", W - padX); zero.setAttribute("y2", zeroY);
    svg.appendChild(zero);

    data.forEach(function (d, i) {
      var cxSlot = padX + slot * i + slot / 2;
      var barH = Math.abs(d.net) / maxAbs * (plotH / 2 - 6);
      if (d.net !== 0) {
        var rect = document.createElementNS(NS, "rect");
        rect.setAttribute("class", "bar");
        rect.setAttribute("x", cxSlot - bw / 2);
        rect.setAttribute("y", d.net >= 0 ? zeroY - barH : zeroY);
        rect.setAttribute("width", bw);
        rect.setAttribute("height", Math.max(2, barH));
        rect.setAttribute("rx", 3);
        rect.setAttribute("fill", d.net >= 0 ? "var(--income-soft)" : "var(--danger-soft)");
        rect.setAttribute("stroke", d.net >= 0 ? "var(--income)" : "var(--danger)");
        rect.setAttribute("stroke-width", "1");
        var tt = document.createElementNS(NS, "title");
        tt.textContent = titleCase(monthFmt.format(parseMonthKey(d.month))) +
          " · ingresos " + money.format(d.income) + " · gastos " + money.format(d.expense) +
          " · balance " + money.format(d.net);
        rect.appendChild(tt);
        svg.appendChild(rect);
      }
      // valor del balance (solo si hubo movimientos ese mes)
      if (d.income || d.expense) {
        var val = document.createElementNS(NS, "text");
        val.setAttribute("x", cxSlot);
        val.setAttribute("y", d.net >= 0 ? (zeroY - barH - 6) : (zeroY + barH + 14));
        val.setAttribute("text-anchor", "middle");
        val.setAttribute("class", d.net >= 0 ? "val-pos" : "val-neg");
        val.textContent = (d.net > 0 ? "+" : "") + moneyCompact.format(d.net);
        svg.appendChild(val);
      }
      // etiqueta de mes
      var lab = document.createElementNS(NS, "text");
      lab.setAttribute("x", cxSlot);
      lab.setAttribute("y", H - 14);
      lab.setAttribute("text-anchor", "middle");
      lab.setAttribute("class", d.month === view.month ? "month-cur" : "");
      lab.textContent = titleCase(monthShortFmt.format(parseMonthKey(d.month))).replace(".", "");
      svg.appendChild(lab);
    });
  }

  function currentTypeCats() {
    var defs = view.formType === "income" ? DEFAULT_INCOME_CATS : DEFAULT_EXPENSE_CATS;
    var set = {};
    defs.forEach(function (c) { set[c] = true; });
    state.entries.forEach(function (e) { if (e.type === view.formType) set[e.category] = true; });
    return Object.keys(set).sort();
  }

  function renderCategoryDatalist() {
    el.categoryList.innerHTML = "";
    currentTypeCats().forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = titleCase(c);
      el.categoryList.appendChild(opt);
    });
  }

  function renderFilters(monthList) {
    el.filters.innerHTML = "";
    var order = totalsByCategory(monthList).map(function (r) { return r.category; });
    el.filters.appendChild(makeChip(null, "Todas", monthList.length));
    if (view.filter && order.indexOf(view.filter) === -1) order.push(view.filter);
    order.forEach(function (cat) {
      var count = monthList.filter(function (e) { return e.category === cat; }).length;
      el.filters.appendChild(makeChip(cat, titleCase(cat), count));
    });
  }

  function makeChip(cat, label, count) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", String(view.filter === cat));
    if (cat) {
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = colorFor(cat);
      b.appendChild(dot);
    }
    b.appendChild(document.createTextNode(label + (count != null ? " (" + count + ")" : "")));
    b.addEventListener("click", function () {
      view.filter = (view.filter === cat) ? null : cat;
      render();
    });
    return b;
  }

  function renderTable(list) {
    var rows = list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    el.expenseRows.innerHTML = "";
    el.listCount.textContent = String(list.length);

    if (!rows.length) {
      el.emptyState.hidden = false;
      return;
    }
    el.emptyState.hidden = true;

    rows.forEach(function (e) {
      var isIncome = e.type === "income";
      var tr = document.createElement("tr");

      var tdDate = document.createElement("td");
      tdDate.className = "td-date";
      tdDate.textContent = dayFmt.format(new Date(e.date + "T00:00:00"));
      tr.appendChild(tdDate);

      var tdCat = document.createElement("td");
      var tag = document.createElement("span");
      tag.className = "cat-tag";
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = colorFor(e.category);
      tag.appendChild(dot);
      tag.appendChild(document.createTextNode(titleCase(e.category)));
      if (isIncome) {
        var badge = document.createElement("span");
        badge.className = "type-badge";
        badge.textContent = "ingreso";
        tag.appendChild(badge);
      }
      tdCat.appendChild(tag);
      tr.appendChild(tdCat);

      var tdNote = document.createElement("td");
      tdNote.className = "td-note";
      tdNote.textContent = e.note || "—";
      tr.appendChild(tdNote);

      var tdAmt = document.createElement("td");
      tdAmt.className = "num td-amount" + (isIncome ? " income" : "");
      tdAmt.textContent = (isIncome ? "+" : "−") + money.format(e.amount);
      tr.appendChild(tdAmt);

      var tdDel = document.createElement("td");
      tdDel.className = "num";
      var del = document.createElement("button");
      del.className = "row-del";
      del.type = "button";
      del.textContent = "Eliminar";
      del.setAttribute("aria-label", "Eliminar " + (isIncome ? "ingreso" : "gasto") + " de " + money.format(e.amount));
      del.addEventListener("click", function () { removeEntry(e.id); });
      tdDel.appendChild(del);
      tr.appendChild(tdDel);

      el.expenseRows.appendChild(tr);
    });
  }

  // ---------- acciones ----------
  function addEntry(data) {
    state.entries.push({
      id: uid(),
      type: data.type === "income" ? "income" : "expense",
      amount: Math.round(data.amount * 100) / 100,
      category: normCat(data.category) || (data.type === "income" ? "otros ingresos" : "otros"),
      note: String(data.note || "").trim().slice(0, 80),
      date: data.date,
    });
    save();
    view.month = data.date.slice(0, 7);
    view.filter = null;
    render();
  }

  function removeEntry(id) {
    var idx = state.entries.findIndex(function (e) { return e.id === id; });
    if (idx === -1) return;
    var e = state.entries[idx];
    var kind = e.type === "income" ? "el ingreso" : "el gasto";
    if (!window.confirm("¿Eliminar " + kind + " de " + money.format(e.amount) + " (" + titleCase(e.category) + ")?")) return;
    state.entries.splice(idx, 1);
    save();
    render();
  }

  function clearMonth() {
    var list = entriesForMonth(view.month);
    if (!list.length) return;
    if (!window.confirm("Se eliminarán " + list.length + " movimiento(s) de " +
      titleCase(monthFmt.format(parseMonthKey(view.month))) + ". Esta acción no se puede deshacer.")) return;
    state.entries = state.entries.filter(function (e) { return e.date.slice(0, 7) !== view.month; });
    view.filter = null;
    save();
    render();
  }

  function exportCSV() {
    var list = entriesForMonth(view.month).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    if (!list.length) { window.alert("No hay movimientos que exportar en este mes."); return; }
    var rows = [["fecha", "tipo", "categoria", "descripcion", "importe"]];
    list.forEach(function (e) {
      rows.push([
        e.date,
        e.type === "income" ? "ingreso" : "gasto",
        e.category,
        (e.note || "").replace(/"/g, '""'),
        String(e.amount).replace(".", ","),
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { return /[",;\n]/.test(c) ? '"' + c + '"' : c; }).join(";");
    }).join("\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "movimientos-" + view.month + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- eventos ----------
  function setFormType(type) {
    view.formType = type === "income" ? "income" : "expense";
    Array.prototype.forEach.call(el.typeToggle.querySelectorAll("button"), function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.type === view.formType));
    });
    var income = view.formType === "income";
    el.expenseForm.classList.toggle("is-income", income);
    el.submitBtn.textContent = income ? "Añadir ingreso" : "Añadir gasto";
    el.category.placeholder = income ? "Nómina" : "Comida";
    el.amountLabel.textContent = income ? "Importe recibido" : "Importe";
    renderCategoryDatalist();
  }

  function wire() {
    el.prevMonth.addEventListener("click", function () {
      view.month = shiftMonth(view.month, -1);
      view.filter = null;
      render();
    });
    el.nextMonth.addEventListener("click", function () {
      if (view.month >= monthKey(new Date())) return;
      view.month = shiftMonth(view.month, 1);
      view.filter = null;
      render();
    });
    el.monthLabel.addEventListener("click", function () {
      view.month = monthKey(new Date());
      view.filter = null;
      render();
    });

    el.typeToggle.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-type]");
      if (btn) setFormType(btn.dataset.type);
    });

    el.expenseForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var amount = parseAmount(el.amount.value);
      var category = el.category.value;
      var date = el.date.value;
      if (!isFinite(amount) || amount <= 0) {
        el.amount.focus();
        el.amount.select();
        return;
      }
      if (!date) { el.date.value = todayISO(); date = el.date.value; }
      if (!normCat(category)) { el.category.focus(); return; }
      addEntry({ type: view.formType, amount: amount, category: category, note: el.note.value, date: date });
      el.expenseForm.reset();
      el.date.value = todayISO();
      el.amount.focus();
    });

    el.exportBtn.addEventListener("click", exportCSV);
    el.clearBtn.addEventListener("click", clearMonth);

    window.addEventListener("storage", function (ev) {
      if (ev.key === STORAGE_KEY) { load(); render(); }
    });
  }

  // ---------- init ----------
  function init() {
    cache();
    load();
    el.date.value = todayISO();
    el.date.max = todayISO();
    setFormType("expense");
    wire();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
