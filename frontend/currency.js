(function () {
  const COUNTRY_TO_CURRENCY = {
    US: 'USD', CA: 'CAD', GB: 'GBP', IN: 'INR', AU: 'AUD', NZ: 'NZD',
    IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR',
    PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', LV: 'EUR', LT: 'EUR', EE: 'EUR',
    SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF',
    JP: 'JPY', SG: 'SGD', KR: 'KRW',
    BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP',
    AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD',
    NG: 'NGN', ZA: 'ZAR', KE: 'KES',
  };

  const CURRENCY_META = {
    USD: { locale: 'en-US', rate: 1 },
    CAD: { locale: 'en-CA', rate: 1.36 },
    GBP: { locale: 'en-GB', rate: 0.79 },
    EUR: { locale: 'de-DE', rate: 0.92 },
    INR: { locale: 'en-IN', rate: 83 },
    AUD: { locale: 'en-AU', rate: 1.52 },
    NZD: { locale: 'en-NZ', rate: 1.64 },
    SEK: { locale: 'sv-SE', rate: 10.4 },
    NOK: { locale: 'nb-NO', rate: 10.7 },
    DKK: { locale: 'da-DK', rate: 6.9 },
    CHF: { locale: 'de-CH', rate: 0.9 },
    JPY: { locale: 'ja-JP', rate: 155 },
    SGD: { locale: 'en-SG', rate: 1.34 },
    KRW: { locale: 'ko-KR', rate: 1350 },
    BRL: { locale: 'pt-BR', rate: 5.1 },
    MXN: { locale: 'es-MX', rate: 17 },
    ARS: { locale: 'es-AR', rate: 850 },
    CLP: { locale: 'es-CL', rate: 950 },
    AED: { locale: 'ar-AE', rate: 3.67 },
    SAR: { locale: 'ar-SA', rate: 3.75 },
    QAR: { locale: 'ar-QA', rate: 3.64 },
    KWD: { locale: 'ar-KW', rate: 0.31 },
    NGN: { locale: 'en-NG', rate: 1500 },
    ZAR: { locale: 'en-ZA', rate: 18.5 },
    KES: { locale: 'en-KE', rate: 130 },
  };

  function detectCountry() {
    const locale = navigator.language || 'en-US';
    const match = locale.match(/-([A-Z]{2})$/);
    return match ? match[1] : null;
  }

  function resolveCurrency() {
    const country = detectCountry() || 'US';
    const currency = COUNTRY_TO_CURRENCY[country] || 'USD';
    const meta = CURRENCY_META[currency] || CURRENCY_META.USD;
    return {
      country,
      currency,
      locale: meta.locale || (navigator.language || 'en-US'),
      rate: meta.rate || 1,
    };
  }

  function formatParts(amount, currency, locale) {
    const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const parts = formatter.formatToParts(amount);
    const symbol = (parts.find((p) => p.type === 'currency') || {}).value || '';
    const number = parts
      .filter((p) => ['integer', 'decimal', 'fraction', 'group'].includes(p.type))
      .map((p) => p.value)
      .join('');
    return { symbol, number, text: formatter.format(amount) };
  }

  function formatFromUsd(usdAmount) {
    const info = resolveCurrency();
    const converted = Math.round((usdAmount * info.rate + Number.EPSILON) * 100) / 100;
    return { ...info, amount: converted, ...formatParts(converted, info.currency, info.locale) };
  }

  function updatePriceNodes() {
    document.querySelectorAll('[data-price-usd]').forEach((el) => {
      const usd = Number(el.getAttribute('data-price-usd'));
      if (Number.isNaN(usd)) return;
      const res = formatFromUsd(usd);
      const symbolEl = el.querySelector('[data-currency-symbol]');
      const numberEl = el.querySelector('[data-currency-number]');
      if (symbolEl && numberEl) {
        symbolEl.textContent = res.symbol || '$';
        numberEl.textContent = res.number || String(usd);
        return;
      }
      el.textContent = res.text || `$${usd}`;
    });

    document.querySelectorAll('[data-price-inline-usd]').forEach((el) => {
      const usd = Number(el.getAttribute('data-price-inline-usd'));
      if (Number.isNaN(usd)) return;
      const res = formatFromUsd(usd);
      el.textContent = res.text || `$${usd}`;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updatePriceNodes();
  });

  window.FF_CURRENCY = {
    resolveCurrency,
    formatFromUsd,
  };
})();
