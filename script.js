"use strict";

const MAX_AMOUNT = 1_000_000_000;
const form = document.getElementById("calculator");
const fields = [...form.querySelectorAll("input")];
const result = document.getElementById("result");
const formStatus = document.getElementById("form-status");
const wonFormatter = new Intl.NumberFormat("ko-KR");

function parseAmount(rawValue, required = false) {
  const text = rawValue.trim();
  if (text === "") {
    return required
      ? { error: "월 실수령액을 입력해 주세요." }
      : { value: 0 };
  }

  const invalid = { error: "250만원, 250만5천원처럼 숫자와 금액 단위를 입력해 주세요. 단위 반복·순서 오류, 음수, 소수는 사용할 수 없습니다. 쉼표는 천 단위로 구분해 주세요." };
  const overLimit = { error: "항목별 금액은 10억 원(1,000,000,000원) 이하로 입력해 주세요." };
  const plainDigits = /^[0-9]+$/;
  const groupedDigits = /^[1-9][0-9]{0,2}(,[0-9]{3})+$/;

  // Tokenize before discarding spaces so "2 50만원" never becomes "250만원".
  const tokens = text.match(/[0-9][0-9,]*|[억만천백십원]|\s+|./gu)
    .filter((token) => !/^\s+$/u.test(token));
  if (tokens.at(-1) === "원") tokens.pop();
  if (!tokens.length) return invalid;

  for (const token of tokens) {
    if (/^[억만천백십]$/u.test(token)) continue;
    if (!plainDigits.test(token) && !groupedDigits.test(token)) return invalid;
  }

  const scales = { 억: 100_000_000n, 만: 10_000n, 천: 1_000n, 백: 100n, 십: 10n };
  const usedUnits = new Set();

  // 천/백/십 form a coefficient for 억/만: 2백만 = (2 × 100) × 10000.
  // Require explicit digits; bare units such as "만원" are not guessed.
  function parseGroup(group) {
    if (!group.length) return null;
    let sum = 0n;
    let previousScale = null;
    for (let index = 0; index < group.length;) {
      const numeric = group[index++];
      if (!plainDigits.test(numeric) && !groupedDigits.test(numeric)) return null;
      const coefficient = BigInt(numeric.replaceAll(",", ""));
      let term = coefficient;
      if (index < group.length) {
        const unit = group[index++];
        if (!/^[천백십]$/u.test(unit) || usedUnits.has(unit)) return null;
        const scale = scales[unit];
        if (previousScale !== null && scale >= previousScale) return null;
        term *= scale;
        // Lower-place terms must not overlap the preceding place.
        if (previousScale !== null && term >= previousScale) return null;
        previousScale = scale;
        usedUnits.add(unit);
      } else if (previousScale !== null && term >= previousScale) {
        return null;
      }
      sum += term;
    }
    return sum;
  }

  let total = 0n;
  let group = [];
  let previousLargeScale = null;
  for (const token of tokens) {
    if (token !== "억" && token !== "만") {
      group.push(token);
      continue;
    }
    const scale = scales[token];
    if (usedUnits.has(token) || (previousLargeScale !== null && scale >= previousLargeScale)) return invalid;
    const coefficient = parseGroup(group);
    if (coefficient === null) return invalid;
    const term = coefficient * scale;
    if (previousLargeScale !== null && term >= previousLargeScale) return invalid;
    total += term;
    previousLargeScale = scale;
    usedUnits.add(token);
    group = [];
  }
  if (group.length) {
    const remainder = parseGroup(group);
    if (remainder === null || (previousLargeScale !== null && remainder >= previousLargeScale)) return invalid;
    total += remainder;
  }
  if (total > BigInt(MAX_AMOUNT)) return overLimit;
  return { value: Number(total) };
}

function clearError(input) {
  input.removeAttribute("aria-invalid");
  const error = document.getElementById(`${input.id}-error`);
  error.textContent = "";
  error.hidden = true;
}

function hideResult() {
  const hadResult = !result.hidden;
  result.hidden = true;
  result.classList.remove("deficit");
  for (const id of ["remaining-value", "balance-status", "income-value", "expense-value"]) {
    document.getElementById(id).textContent = "";
  }
  return hadResult;
}

form.addEventListener("input", (event) => {
  if (!fields.includes(event.target)) return;
  clearError(event.target);
  if (hideResult()) {
    formStatus.textContent = "입력값이 바뀌었습니다. 다시 계산해 주세요.";
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  hideResult();
  formStatus.textContent = "";

  const values = [];
  let firstInvalid = null;
  for (const input of fields) {
    clearError(input);
    const parsed = parseAmount(input.value, input.id === "income");
    if (parsed.error) {
      const error = document.getElementById(`${input.id}-error`);
      error.textContent = parsed.error;
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      firstInvalid ??= input;
    } else {
      values.push(parsed.value);
    }
  }

  if (firstInvalid) {
    formStatus.textContent = "입력값을 확인해 주세요. 오류가 있는 항목 아래에 안내를 표시했습니다.";
    firstInvalid.focus();
    return;
  }

  const [income, ...expenses] = values;
  const totalExpenses = expenses.reduce((total, amount) => total + amount, 0);
  const remaining = income - totalExpenses;
  const formatWon = (amount) => `${wonFormatter.format(amount)}원`;

  document.getElementById("income-value").textContent = formatWon(income);
  document.getElementById("expense-value").textContent = formatWon(totalExpenses);
  document.getElementById("remaining-value").textContent = formatWon(remaining);
  const status = remaining < 0
    ? "적자입니다. 이번 달 지출이 실수령액을 초과했습니다."
    : remaining === 0
      ? "적자는 아니지만, 이번 달 남는 돈이 없습니다."
      : "적자가 아닙니다. 이번 달 아직 배분하지 않은 금액이에요.";
  document.getElementById("balance-status").textContent = status;
  result.classList.toggle("deficit", remaining < 0);
  result.hidden = false;
  formStatus.textContent = `계산 완료. 이번 달 남는 돈은 ${formatWon(remaining)}입니다. ${status}`;
  result.scrollIntoView({ block: "nearest", behavior: "instant" });
});
