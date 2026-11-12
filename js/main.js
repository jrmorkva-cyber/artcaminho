/* ARTCAMINHO — интерактив сайта (без зависимостей) */
(function () {
  "use strict";

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };

  /* ---------- Хранилище (localStorage может быть недоступен) ---------- */
  var store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* без сохранения */ }
    }
  };

  var formatPrice = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽"; };

  /* ---------- Уведомление ---------- */
  var toastEl = $("[data-toast]");
  var toastTimer;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-shown"); }, 2200);
  }

  /* ---------- Товары на странице: присваиваем id ---------- */
  var pageKey = (location.pathname.split("/").pop() || "index.html").replace(".html", "");
  $$("[data-product]").forEach(function (el, i) {
    if (!el.dataset.id) el.dataset.id = pageKey + "-" + (i + 1);
  });
  function productData(el) {
    return { id: el.dataset.id, name: el.dataset.name, price: Number(el.dataset.price) || 0, img: el.dataset.img };
  }

  /* ---------- Блокировка прокрутки ---------- */
  var openLayers = 0;
  function lock(on) {
    openLayers = Math.max(0, openLayers + (on ? 1 : -1));
    document.body.classList.toggle("is-locked", openLayers > 0);
  }

  /* ---------- Модальные окна ---------- */
  var lastFocus = null;
  function openModal(name) {
    var el = $('[data-overlay="' + name + '"]');
    if (!el || el.classList.contains("is-open")) return;
    lastFocus = document.activeElement;
    el.classList.add("is-open");
    lock(true);
    var f = $("[data-close], button, a, input", el);
    if (f) setTimeout(function () { f.focus(); }, 50);
  }
  function closeModal(el) {
    if (!el.classList.contains("is-open")) return;
    el.classList.remove("is-open");
    lock(false);
    if (lastFocus) lastFocus.focus();
  }
  $$(".overlay[role=dialog]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      if (e.target === el || e.target.closest("[data-close]")) closeModal(el);
    });
  });

  /* ---------- Мобильное меню ---------- */
  var menu = $("#mobile-menu");
  function setMenu(open) {
    if (!menu) return;
    if (menu.classList.contains("is-open") === open) return;
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    lock(open);
  }
  $$("[data-menu-open]").forEach(function (b) { b.addEventListener("click", function () { setMenu(true); }); });
  $$("[data-menu-close]").forEach(function (b) { b.addEventListener("click", function () { setMenu(false); }); });

  /* ---------- Избранное ---------- */
  var favs = store.get("ac-favs", []);
  function isFav(id) { return favs.some(function (f) { return f.id === id; }); }
  function syncFavs() {
    store.set("ac-favs", favs);
    $$("[data-fav-count]").forEach(function (b) { b.textContent = favs.length || ""; b.dataset.count = favs.length; });
    $$("[data-fav-count-text]").forEach(function (b) { b.textContent = favs.length ? "(" + favs.length + ")" : ""; });
    $$("[data-product]").forEach(function (card) {
      var btn = $("[data-fav]", card);
      if (!btn) return;
      var on = isFav(card.dataset.id);
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Убрать из избранного" : "В избранное");
      var use = $("use", btn);
      if (use) use.setAttribute("href", on ? "#i-heart-fill" : "#i-heart");
    });
  }

  /* ---------- Корзина ---------- */
  var cart = store.get("ac-cart", []);
  var cartEl = $("#cart");
  var cartOverlay = $('[data-overlay="cart"]');
  var cartList = $("[data-cart-list]");

  function setCart(open) {
    if (!cartEl || cartEl.classList.contains("is-open") === open) return;
    if (open) setMenu(false);
    cartEl.classList.toggle("is-open", open);
    cartOverlay.classList.toggle("is-open", open);
    cartEl.setAttribute("aria-hidden", String(!open));
    lock(open);
    if (open) { var c = $("[data-cart-close]", cartEl); if (c) c.focus(); }
  }

  // Удалённый товар можно вернуть в течение UNDO_SECONDS секунд
  var UNDO_SECONDS = 5;
  var pending = {}; // id -> { left, timer }
  function activeCart() { return cart.filter(function (i) { return !pending[i.id]; }); }

  function finalizeRemove(id) {
    if (!pending[id]) return;
    clearInterval(pending[id].timer);
    delete pending[id];
    cart = cart.filter(function (i) { return i.id !== id; });
    renderCart();
  }
  function scheduleRemove(id) {
    if (pending[id]) return;
    var p = pending[id] = { left: UNDO_SECONDS };
    p.timer = setInterval(function () {
      p.left -= 1;
      if (p.left <= 0) return finalizeRemove(id);
      var t = cartList && cartList.querySelector('[data-id="' + id + '"] [data-timer]');
      if (t) t.textContent = p.left;
    }, 1000);
    renderCart();
    var undo = cartList && cartList.querySelector('[data-id="' + id + '"] [data-undo]');
    if (undo) undo.focus();
  }
  function cancelPending(id) {
    clearInterval(pending[id].timer);
    delete pending[id];
  }
  function undoRemove(id) {
    if (!pending[id]) return;
    cancelPending(id);
    renderCart();
    toast("Товар возвращён в корзину");
  }

  function renderCart() {
    var active = activeCart();
    store.set("ac-cart", active);
    var count = active.reduce(function (s, i) { return s + i.qty; }, 0);
    var total = active.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
    $$("[data-cart-count]").forEach(function (b) { b.textContent = count || ""; b.dataset.count = count; });
    $$("[data-cart-count-text]").forEach(function (b) { b.textContent = count ? "(" + count + ")" : ""; });
    $$("[data-cart-total]").forEach(function (b) { b.textContent = formatPrice(total); });
    if (!cartList) return;
    if (!cart.length) {
      cartList.innerHTML = '<li class="cart__empty">Корзина пуста. <a href="catalog.html">Перейти в магазин</a></li>';
      return;
    }
    cartList.innerHTML = cart.map(function (item) {
      var p = pending[item.id];
      if (p) {
        return '<li class="cart-item cart-item--removed" data-id="' + item.id + '">' +
          '<span class="undo-timer" style="--undo:' + UNDO_SECONDS + 's;--undo-delay:-' + (UNDO_SECONDS - p.left) + 's" aria-hidden="true">' +
            '<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16"/><circle class="undo-timer__bar" cx="18" cy="18" r="16"/></svg>' +
            '<span data-timer>' + p.left + "</span></span>" +
          '<p class="cart-item__removed-text">Товар <b>' + item.name + "</b> удалён из корзины</p>" +
          '<button class="btn btn--light cart-item__undo" type="button" data-undo>Вернуть товар</button>' +
          "</li>";
      }
      return '<li class="cart-item" data-id="' + item.id + '">' +
        '<div class="cart-item__img"><img src="' + item.img + '" alt=""></div>' +
        '<div class="cart-item__info"><p class="cart-item__title">' + item.name + '</p><p class="price">' + formatPrice(item.price) + "</p></div>" +
        '<div class="qty"><button type="button" data-qty="-1" aria-label="Уменьшить">-</button><output aria-live="polite">' + item.qty + '</output><button type="button" data-qty="1" aria-label="Увеличить">+</button></div>' +
        '<button class="square-btn square-btn--light cart-item__remove" type="button" data-remove aria-label="Удалить из корзины"><svg aria-hidden="true"><use href="#i-close"/></svg></button>' +
        "</li>";
    }).join("");
  }

  if (cartList) {
    cartList.addEventListener("click", function (e) {
      var row = e.target.closest(".cart-item");
      if (!row) return;
      var id = row.dataset.id;
      var item = cart.find(function (i) { return i.id === id; });
      if (!item) return;
      if (e.target.closest("[data-undo]")) return undoRemove(id);
      var q = e.target.closest("[data-qty]");
      if (q) {
        if (item.qty + Number(q.dataset.qty) < 1) return scheduleRemove(id);
        item.qty += Number(q.dataset.qty);
        renderCart();
      } else if (e.target.closest("[data-remove]")) {
        scheduleRemove(id);
      }
    });
  }

  $$("[data-cart-open]").forEach(function (b) { b.addEventListener("click", function () { setCart(true); }); });
  $$("[data-cart-close]").forEach(function (b) { b.addEventListener("click", function () { setCart(false); }); });
  if (cartOverlay) cartOverlay.addEventListener("click", function () { setCart(false); });

  /* ---------- Клики по карточкам: избранное и корзина ---------- */
  document.addEventListener("click", function (e) {
    var favBtn = e.target.closest("[data-fav]");
    var addBtn = e.target.closest("[data-add-to-cart]");
    if (!favBtn && !addBtn) return;
    var card = e.target.closest("[data-product]");
    if (!card) return;
    var data = productData(card);

    if (favBtn) {
      if (isFav(data.id)) {
        favs = favs.filter(function (f) { return f.id !== data.id; });
        toast("Удалено из избранного");
        if (card.closest("[data-fav-list]")) { card.remove(); toggleFavEmpty(); }
      } else {
        favs.push(data);
        toast("Добавлено в избранное");
      }
      syncFavs();
    }

    if (addBtn) {
      var found = cart.find(function (i) { return i.id === data.id; });
      if (found && pending[found.id]) cancelPending(found.id);
      else if (found) found.qty += 1; else cart.push(Object.assign({ qty: 1 }, data));
      renderCart();
      toast("Товар добавлен в корзину");
      addBtn.textContent = "В корзине ✓";
      setTimeout(function () { addBtn.textContent = "Добавить в корзину"; }, 1500);
    }
  });

  /* ---------- Страница «Избранное» ---------- */
  var favList = $("[data-fav-list]");
  var favEmpty = $("[data-fav-empty]");
  function toggleFavEmpty() { if (favEmpty) favEmpty.hidden = !!$("[data-product]", favList); }
  if (favList) {
    var tpl = $("#card-template");
    favs.forEach(function (f) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = f.id;
      node.dataset.name = f.name;
      node.dataset.price = f.price;
      node.dataset.img = f.img;
      $(".product-card__title a", node).textContent = f.name;
      $(".product-card__price", node).textContent = formatPrice(f.price);
      favList.appendChild(node);
    });
    toggleFavEmpty();
  }

  /* ---------- Аккордеоны (товар, художник) и группы фильтра ---------- */
  document.addEventListener("click", function (e) {
    var head = e.target.closest(".accordion__head, .filter__head");
    if (!head) return;
    var item = head.parentElement;
    var open = !item.classList.contains("is-open");
    item.classList.toggle("is-open", open);
    head.setAttribute("aria-expanded", String(open));
  });

  /* ---------- Фильтр ---------- */
  $$("[data-filter-toggle]").forEach(function (btn) {
    var form = btn.parentElement.querySelector("[data-filter]");
    btn.addEventListener("click", function () {
      form.hidden = !form.hidden;
      btn.setAttribute("aria-expanded", String(!form.hidden));
    });
  });
  $$("[data-filter]").forEach(function (form) {
    form.addEventListener("submit", function (e) { e.preventDefault(); toast("Фильтр применён"); });
    form.addEventListener("reset", function () { setTimeout(function () { toast("Фильтр сброшен"); }, 0); });
    $$('input[inputmode="numeric"]', form).forEach(function (inp) {
      inp.addEventListener("input", function () {
        var digits = inp.value.replace(/\D/g, "");
        inp.value = digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "";
      });
    });
  });

  /* ---------- Формы «Телефон + согласие» ---------- */
  // Заявки уходят в send.php, который пересылает их на почту магазина (настройка — в начале send.php)

  // Маска телефона: +7 (900) 000-00-00
  function phoneDigits(v) {
    var d = String(v).replace(/\D/g, "");
    if (d[0] === "8") d = "7" + d.slice(1);
    if (d && d[0] !== "7") d = "7" + d;
    return d.slice(0, 11);
  }
  function formatPhone(d) {
    if (!d) return "";
    var out = "+7";
    if (d.length > 1) out += " (" + d.slice(1, 4);
    if (d.length >= 4) out += ")";
    if (d.length > 4) out += " " + d.slice(4, 7);
    if (d.length > 7) out += "-" + d.slice(7, 9);
    if (d.length > 9) out += "-" + d.slice(9, 11);
    return out;
  }
  $$("[data-phone]").forEach(function (inp) {
    inp.addEventListener("input", function () { inp.value = formatPhone(phoneDigits(inp.value)); });
    inp.addEventListener("focus", function () { if (!inp.value) inp.value = "+7 ("; });
    inp.addEventListener("blur", function () { if (phoneDigits(inp.value).length <= 1) inp.value = ""; });
  });

  function formName(form) {
    if (form.closest("#cart")) return "Заказ из корзины";
    if (form.closest(".contacts")) return "Контакты: «Не знаете, что выбрать?»";
    if (form.closest(".cta")) return "Есть вопросы? Мы на связи!";
    return "Форма на сайте";
  }

  $$("[data-subscribe]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var phone = form.elements.phone;
      var agree = form.elements.agree;
      var btn = $("button[type=submit]", form);
      if (phoneDigits(phone.value).length !== 11) { toast("Введите номер телефона полностью"); phone.focus(); return; }
      if (agree && !agree.checked) { toast("Нужно согласие на обработку данных"); agree.focus(); return; }
      if (form.classList.contains("is-sending")) return;

      var fromCart = !!form.closest("#cart");
      if (fromCart && !activeCart().length) { toast("Корзина пуста — добавьте товары"); return; }

      var data = new FormData(form);
      data.set("agree", agree && agree.checked ? "1" : "");
      data.set("form", formName(form));
      data.set("page", location.href);
      if (fromCart) data.set("cart", JSON.stringify(activeCart()));

      form.classList.add("is-sending");
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = "Отправляем…";

      // Демо-режим: на GitHub Pages нет PHP — заявка не отправляется, сразу показываем «Спасибо»
      var isDemo = /\.github\.io$/i.test(location.hostname);
      (isDemo
        ? new Promise(function (resolve) { setTimeout(resolve, 600); })
        : fetch(form.getAttribute("action") || "send.php", { method: "POST", body: data, headers: { Accept: "application/json" } })
          .then(function (res) {
            return res.json().catch(function () { return { ok: false }; }).then(function (json) {
              if (!res.ok || !json.ok) throw new Error(json.error || "Не удалось отправить, попробуйте позже");
            });
          }))
        .then(function () {
          form.reset();
          if (fromCart) { Object.keys(pending).forEach(cancelPending); cart = []; renderCart(); }
          setCart(false);
          openModal("success");
        })
        .catch(function (err) {
          toast(err && err.message && !/fetch|network/i.test(err.message) ? err.message : "Нет связи с сервером, попробуйте позже");
        })
        .then(function () {
          form.classList.remove("is-sending");
          btn.disabled = false;
          btn.textContent = label;
        });
    });
  });

  /* ---------- Художник ---------- */
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-artist-open]")) { e.preventDefault(); openModal("artist"); }
  });

  /* ---------- Категории на главной ---------- */
  var cats = $("[data-categories]");
  if (cats) {
    var hoverable = window.matchMedia("(hover: hover) and (min-width: 1101px)");
    $$(".category", cats).forEach(function (c) {
      c.addEventListener("mouseenter", function () {
        if (!hoverable.matches) return;
        $$(".category", cats).forEach(function (x) { x.classList.toggle("is-active", x === c); });
      });
    });
  }
  $$("[data-scroll-prev], [data-scroll-next]").forEach(function (btn) {
    var target = $(btn.dataset.scrollPrev || btn.dataset.scrollNext);
    if (!target) return;
    var dir = btn.hasAttribute("data-scroll-next") ? 1 : -1;
    btn.addEventListener("click", function () {
      if (target.scrollWidth > target.clientWidth + 4) {
        target.scrollBy({ left: dir * 261, behavior: "smooth" });
        return;
      }
      // Всё помещается — переключаем активную категорию
      var items = $$(".category", target);
      var idx = items.findIndex(function (x) { return x.classList.contains("is-active"); });
      var next = items[(idx + dir + items.length) % items.length];
      items.forEach(function (x) { x.classList.toggle("is-active", x === next); });
    });
  });

  /* ---------- Галерея товара ---------- */
  $$("[data-gallery]").forEach(function (g) {
    var thumbs = $$(".product-gallery__thumb", g);
    var dots = $$("[data-gallery-dots] button", g);
    var main = $("[data-gallery-main]", g);
    var current = 0;
    function go(i) {
      current = (i + thumbs.length) % thumbs.length;
      thumbs.forEach(function (t, k) { t.classList.toggle("is-active", k === current); });
      dots.forEach(function (d, k) { d.classList.toggle("is-active", k === current); });
      var src = $("img", thumbs[current]).getAttribute("src");
      if (main.getAttribute("src") !== src) main.setAttribute("src", src);
    }
    thumbs.forEach(function (t, k) { t.addEventListener("click", function () { go(k); }); });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k); }); });
    var prev = $("[data-gallery-prev]", g), next = $("[data-gallery-next]", g);
    if (prev) prev.addEventListener("click", function () { go(current - 1); });
    if (next) next.addEventListener("click", function () { go(current + 1); });
  });

  /* ---------- Esc закрывает всё ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    $$(".overlay[role=dialog].is-open").forEach(closeModal);
    setCart(false);
    setMenu(false);
  });

  /* ---------- Большой логотип проявляется при прокрутке ---------- */
  var reveals = $$("[data-reveal]");
  if (reveals.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
        });
      }, { threshold: 0.3 });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("is-visible"); });
    }
  }

  /* ---------- Уведомление о cookie ---------- */
  var cookieBar = $("[data-cookie]");
  if (cookieBar && !store.get("ac-cookie", false)) {
    setTimeout(function () { cookieBar.hidden = false; requestAnimationFrame(function () { cookieBar.classList.add("is-shown"); }); }, 800);
    $("[data-cookie-accept]", cookieBar).addEventListener("click", function () {
      store.set("ac-cookie", true);
      cookieBar.classList.remove("is-shown");
      setTimeout(function () { cookieBar.hidden = true; }, 300);
    });
  }

  syncFavs();
  renderCart();
})();
