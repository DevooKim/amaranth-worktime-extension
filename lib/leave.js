// 연차 신청 payload 조립. 네트워크는 주입받은 call 만 쓴다.

import { formatDate } from "./calc.js";

const ORIGIN = "https://gw.goorm.io";
const MENU = "HPD0110";

export const LEAVE_KINDS = {
  연차: {
    atCd: "1101",
    linkAtCd: "1010",
    timeSetFg: "ALL",
    atNm: "연차",
    startTm: "0900",
    endTm: "1800",
    formId: "249",
    formDTp: "HP_HPD0110_00011",
    formNm: "연차휴가신청서",
  },
  오전반차: {
    atCd: "1102",
    linkAtCd: "1010",
    timeSetFg: "AM",
    atNm: "오전반차",
    startTm: "0900",
    endTm: "1200",
    formId: "249",
    formDTp: "HP_HPD0110_00011",
    formNm: "연차휴가신청서",
  },
  오후반차: {
    atCd: "1103",
    linkAtCd: "1010",
    timeSetFg: "PM",
    atNm: "오후반차",
    startTm: "1500",
    endTm: "1800",
    formId: "249",
    formDTp: "HP_HPD0110_00011",
    formNm: "연차휴가신청서",
  },
};

export class LeaveError extends Error {}

/** '09:00' / '900' / '0900' → '0900' */
export function toHhmm(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const d =
    digits.length <= 2
      ? digits.padStart(2, "0") + "00"
      : digits.padStart(4, "0");
  return d.slice(0, 4);
}

/** '0900' → '09:00' */
export function toTimeInput(hhmm) {
  const t = toHhmm(hhmm);
  return t ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : "";
}

export function ymd(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

/**
 * 캘린더 range 클릭.
 * 첫 클릭은 시작일(종료일도 같음). 둘째 클릭이 반대쪽 끝을 채운다.
 * 구간이 정해진 뒤 다시 누르면 새 구간을 시작한다.
 */
export function pickDateRange(state, date) {
  const day = ymd(date);
  if (!day) return { ...state };
  if (!state?.anchor) {
    return { start: day, end: day, anchor: day };
  }
  if (day < state.anchor)
    return { start: day, end: state.anchor, anchor: null };
  return { start: state.anchor, end: day, anchor: null };
}

/** 시작일을 고른 뒤 마우스를 올리면 임시 구간을 보여 준다. */
export function previewDateRange(state, hover) {
  const day = ymd(hover);
  if (!state?.anchor || !day) return { start: state.start, end: state.end };
  if (day < state.anchor) return { start: day, end: state.anchor };
  return { start: state.anchor, end: day };
}

export function inDateRange(date, start, end) {
  const d = ymd(date);
  return d >= ymd(start) && d <= ymd(end);
}

function asDate(date) {
  const s = ymd(date);
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}

export function eachYmd(start, end) {
  const out = [];
  const d = asDate(start);
  const last = asDate(end);
  const p = (n) => String(n).padStart(2, "0");
  while (d <= last) {
    out.push(`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function isWeekend(date) {
  const w = asDate(date).getDay();
  return w === 0 || w === 6;
}

export function holidaySetFromList(list) {
  const set = new Set();
  for (const h of list || []) {
    if (typeof h === "string") {
      const day = ymd(h);
      if (day) set.add(day);
      continue;
    }
    const yn = h?.holiYn ?? h?.holidayYn;
    if (yn && yn !== "Y") continue;
    const day = ymd(h?.holiDt || h?.date || h?.h_day);
    if (day) set.add(day);
  }
  return set;
}

/** 주말·공휴일을 빼고, 연속 근무일끼리 구간으로 묶는다. */
export function workingDaySegments(start, end, holidays = []) {
  const holi =
    holidays instanceof Set ? holidays : holidaySetFromList(holidays);
  const days = eachYmd(start, end).filter((d) => !isWeekend(d) && !holi.has(d));
  const segs = [];
  for (const d of days) {
    const prev = segs[segs.length - 1];
    if (prev) {
      const gap = (asDate(d) - asDate(prev.end)) / 86400000;
      if (gap === 1) {
        prev.end = d;
        prev.days += 1;
        continue;
      }
    }
    segs.push({ start: d, end: d, days: 1 });
  }
  return segs;
}

function asRowList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["resultData", "attendApplications", "list", "rows"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const value of Object.values(data)) {
    if (!Array.isArray(value) || !value.length) continue;
    const row = value[0];
    if (row && (row.atDt || row.startDt || row.approState != null))
      return value;
  }
  return [];
}

export function parsePendingApplications(data) {
  const out = [];
  for (const group of data?.atPopUpDetailInfos || []) {
    for (const app of group.attendApplications || []) {
      if (String(app.approState) !== "0") continue;
      const start = ymd(app.startDt);
      if (start.length !== 8) continue;
      out.push({
        start,
        end: ymd(app.endDt) || start,
        name: app.atNm || app.atItemNm || "휴가",
        code: app.atCd || null,
        pending: true,
        nextEmpNm: app.nextEmpNm || "",
      });
    }
  }
  return out;
}

/** HPD0110 캘린더 응답. 하루 1 row 이므로 appSq 로 묶고 실제 atDt 만 펼친다. */
export function parsePendingCalendarRows(rows) {
  const list = asRowList(rows);
  const byApp = new Map();
  for (const row of list) {
    if (String(row.approState) !== "0") continue;
    const atDt = ymd(row.atDt || row.startDt);
    if (atDt.length !== 8) continue;
    const appSq = String(row.appSq || row.linkKey || atDt);
    const cur = byApp.get(appSq) || {
      start: atDt,
      end: atDt,
      dates: [],
      name: row.atCdNm || row.atNm || "휴가",
      code: row.atCd || null,
      pending: true,
      nextEmpNm: row.nextEmpNm || "",
      appSq,
    };
    cur.dates.push(atDt);
    if (atDt < cur.start) cur.start = atDt;
    if (atDt > cur.end) cur.end = atDt;
    if (row.nextEmpNm) cur.nextEmpNm = row.nextEmpNm;
    if (row.atCdNm || row.atNm) cur.name = row.atCdNm || row.atNm;
    byApp.set(appSq, cur);
  }
  return [...byApp.values()].map((leave) => ({
    ...leave,
    dates: [...new Set(leave.dates)].sort(),
  }));
}

export function mergeLeaves(existing = [], extra = []) {
  const key = (l) =>
    `${String(l.start).slice(0, 8)}:${String(l.end || l.start).slice(0, 8)}:${l.code || l.name}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const leave of extra) {
    const k = key(leave);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(leave);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

const VALIDATION_HINTS = {
  insufficientAnnualLeaveList: "잔여 연차가 부족해요.",
  duplicateSubmittedApplicationDetails: "이미 신청한 기간과 겹쳐요.",
  duplicateAlreadyAddedList: "같은 신청이 이미 들어가 있어요.",
  notGeneratedAnnualLeaveList: "아직 연차가 발생하지 않은 기간이에요.",
  annualLeaveClosedList: "연차 마감된 기간이에요.",
  minusAnnualLeaveLimitedList: "연차를 더 쓸 수 없는 기간이에요.",
  minusAnnualUsedList: "연차 사용 한도를 넘어요.",
};

export function collectValidationProblems(result) {
  const out = {};
  if (!result || typeof result !== "object") return out;
  for (const [key, val] of Object.entries(result)) {
    if (Array.isArray(val) && val.length) out[key] = val;
  }
  return out;
}

export function formatValidationMessage(problems) {
  const keys = Object.keys(problems || {});
  if (!keys.length) return "";
  const hints = keys.map((k) => VALIDATION_HINTS[k]).filter(Boolean);
  return hints[0] || "이 기간에는 신청할 수 없어요.";
}

export function resolveEmployee(base, identity = {}) {
  const emp =
    base?.employee && typeof base.employee === "object" ? base.employee : {};
  return {
    coCd: String(emp.coCd || identity.coCd || "1000"),
    empCd: String(emp.empCd || identity.empCd || ""),
    korNm: emp.korNm || identity.empName || "",
    deptCd: String(emp.deptCd || identity.deptCd || ""),
    deptNm: emp.deptNm || identity.deptName || "",
    divNm: emp.divNm || identity.divNm || "",
  };
}

export function newApproKey(randomBytes = defaultRandomBytes) {
  const h = () => randomBytes(2);
  return `ERP_${[h() + h(), h(), h(), h(), h() + h() + h()].join("-")}`;
}

function defaultRandomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function approvalPopupUrl({ formId, approKey, popupUUID }) {
  const q = new URLSearchParams({
    MicroModuleCode: "eap",
    appLineId: "",
    appLineList: "[]",
    approkey: approKey,
    fileList: "[]",
    formId: String(formId),
    callComp: "UBAP001",
    popupUUID: popupUUID || crypto.randomUUID(),
  });
  return `${ORIGIN}/#/popup?${q}`;
}

export const HPD0110_URL = `${ORIGIN}/#/HP/HPD0110/HPD0110`;

function workWindow(tm) {
  const w =
    (tm?.workTimeList || []).find(
      (x) => x.atCd === "9202" && x.worktimeFg === "1",
    ) || {};
  return { comeStTm: w.wksdTm || "", leaveStTm: w.wkedTm || "" };
}

export function buildAppItem({
  emp,
  def,
  startDt,
  endDt,
  tm,
  startTm,
  endTm,
  appDy,
  appTm,
  ycUseCnt,
}) {
  const win = workWindow(tm);
  return {
    detailSq: null,
    coCd: emp.coCd,
    appDt: null,
    appSq: null,
    deptCd: emp.deptCd,
    empCd: emp.empCd,
    empNm: emp.korNm,
    deptNm: emp.deptNm,
    linkAtCd: def.linkAtCd,
    atCd: def.atCd,
    atYm: null,
    atDt: startDt,
    baseAtDt: null,
    startDt,
    endDt,
    comeStTm: win.comeStTm,
    leaveStTm: win.leaveStTm,
    startTm,
    endTm,
    actStartTm: null,
    actEndTm: null,
    appDyFg: "D",
    appDy: String(appDy),
    appTm,
    appRmkDc: "",
    ycUseCnt,
    ycGrantCnt: 0,
    atSchYn: "N",
    workTp: "1",
    groupCd: tm.groupCd,
    timeCd: tm.timeCd,
    reportCancYn: "N",
    cancellationApplication: false,
  };
}

export function buildNewItem({
  emp,
  def,
  startDt,
  endDt,
  tm,
  startTm,
  endTm,
  calc,
  today,
}) {
  return {
    id: "",
    checked: false,
    coCd: emp.coCd,
    deptCd: "",
    deptNm: "",
    empCd: "",
    empNm: "",
    atCd: def.atCd,
    atNm: def.atNm,
    timeSetFg: def.timeSetFg,
    linkAtCd: def.linkAtCd,
    atDt: today,
    baseAtDt: "",
    startDt,
    endDt,
    comeStTm: "",
    leaveStTm: "",
    startTm,
    endTm,
    actStartTm: "",
    actEndTm: "",
    appDy: calc.applicationDaysCnt,
    appDyFg: "D",
    appTm: calc.applicationMinutes,
    actAppTm: calc.dailyAppTm,
    dailyAppTm: calc.dailyAppTm,
    appRmkDc: "",
    ycUseCnt: calc.ycUseCnt,
    dailyCalculatedTimeYcUseCnt: calc.dailyCalculatedTimeYcUseCnt,
    ycGrantCnt: "",
    conFg: "",
    reatCd: "",
    chargeFg: "F",
    eduWayFg: "ON",
    ectRetunYn: "N",
    workFg: "",
    overworkTm: 0,
    nightworkTm: 0,
    timeCd: null,
    groupCd: "",
    dayOfWeek: "",
    repeatTp: "NONE",
    repeatFg: "",
    repeatFgList: [],
    standardWorkTm: 0,
    basicWorkTm: 0,
    datePeriod: { from: startDt, to: endDt },
    workTp: tm.workTp,
    holidayYn: "N",
    workTpHolidayYn: "",
    coreStartTm: "",
    coreEndTm: "",
    actAppTp: "",
    holidayWork: {
      workFg: "1",
      atDt: "",
      startTm,
      endTm,
      appTm: calc.applicationMinutes,
      timeCd: "",
      dayOfWeek: "",
    },
    workPlanStartDt: today,
    elasticDailyWorkPlanComplete: {},
    employeeList: [emp],
    atColorCd: "#53abfe",
  };
}

/**
 * 근태신청서를 만들고 전자결재 팝업 URL 을 돌려준다.
 * 상신(eap110A06)은 하지 않는다 — 그룹웨어 화면에서 직접 올린다.
 *
 * call(pathname, body) 는 resultData 를 반환해야 한다.
 */
export async function applyAnnualLeave(
  call,
  {
    identity,
    kind,
    startDt,
    endDt,
    startTm,
    endTm,
    now = new Date(),
    randomUUID = () => crypto.randomUUID(),
  },
) {
  const def = LEAVE_KINDS[kind];
  if (!def) throw new LeaveError(`알 수 없는 휴가 종류예요: ${kind}`);

  const start = ymd(startDt);
  const end = ymd(endDt || startDt);
  if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) {
    throw new LeaveError("날짜를 확인해 주세요.");
  }
  if (end < start) throw new LeaveError("종료일이 시작일보다 앞설 수 없어요.");

  const today = formatDate(now);
  const base =
    (await call(
      "/human/common/attendapplication/getApplicationBaseInfo",
      {},
    )) || {};
  const emp = resolveEmployee(base, identity);
  if (!emp.empCd) throw new LeaveError("사번을 아직 못 읽었어요.");

  const tm = await call(
    "/human/common/attendapplication/getStartTmEndTmByWorkType",
    {
      empCd: emp.empCd,
      startDate: start,
      endDate: end,
      atCd: def.atCd,
      linkAtCd: def.linkAtCd,
    },
  );

  const st = toHhmm(startTm) || tm.startTm || def.startTm;
  const et = toHhmm(endTm) || tm.endTm || def.endTm;

  const calc = await call(
    "/human/common/attendapplication/calculateApplicationDays",
    {
      startDate: start,
      endDate: end,
      startTime: st,
      endTime: et,
      atCd: def.atCd,
      linkAtCd: def.linkAtCd,
      empCd: emp.empCd,
      appRmkDc: "",
      calculateOption: "HOLIDAY_EXCLUSION",
      repeatTp: "NONE",
      repeatFgList: [],
    },
  );

  const newItem = buildNewItem({
    emp,
    def,
    startDt: start,
    endDt: end,
    tm,
    startTm: st,
    endTm: et,
    calc,
    today,
  });
  const validated = await call("/human/attendapplication/validateNew", {
    checkRange: "ALL",
    checkPoint: "ADD",
    empCdList: [emp.empCd],
    newItem,
    alreadyAddedItems: [],
  });
  const problems = collectValidationProblems(validated);
  if (Object.keys(problems).length) {
    throw new LeaveError(formatValidationMessage(problems));
  }

  const calcDays = (from, to) =>
    call("/human/common/attendapplication/calculateApplicationDays", {
      startDate: from,
      endDate: to,
      startTime: st,
      endTime: et,
      atCd: def.atCd,
      linkAtCd: def.linkAtCd,
      empCd: emp.empCd,
      appRmkDc: "",
      calculateOption: "HOLIDAY_EXCLUSION",
      repeatTp: "NONE",
      repeatFgList: [],
    });

  let segs = [{ start, end }];
  if (def.timeSetFg === "ALL" && start !== end) {
    const years = [...new Set([start.slice(0, 4), end.slice(0, 4)])];
    const holis = holidaySetFromList(calc.holidayList);
    for (const year of years) {
      const list = await call("/human/common/getHolidayList", { year });
      for (const d of holidaySetFromList(list)) holis.add(d);
    }
    segs = workingDaySegments(start, end, holis);
    if (!segs.length) {
      throw new LeaveError("선택한 기간에 신청할 근무일이 없어요.");
    }
  }

  const items = [];
  for (const seg of segs) {
    const segCalc =
      seg.start === start && seg.end === end
        ? calc
        : await calcDays(seg.start, seg.end);
    items.push(
      buildAppItem({
        emp,
        def,
        startDt: seg.start,
        endDt: seg.end,
        tm,
        startTm: st,
        endTm: et,
        appDy: segCalc.applicationDaysCnt,
        appTm: segCalc.applicationMinutes,
        ycUseCnt: segCalc.ycUseCnt,
      }),
    );
  }

  const titleDc = await call("/human/attendapplication/0hr00011", {
    applicationList: items,
    employeeList: [emp],
  });

  const created = await call("/human/attendapplication/create", {
    coCd: "",
    appDt: "",
    appEmpCd: emp.empCd,
    deptCd: "",
    titleDc,
    approLineId: "",
    calLinkKey: "",
    linkKey: "",
    approState: "",
    fileGroup: 0,
    employeeList: [emp],
    version: "v2",
    applicationList: items,
  });

  const approKey = newApproKey();
  try {
    const link = await call("/system/apiUtilEap/GetLinkKey", {
      menuCode: MENU,
      approKey,
      vPCoCd: emp.coCd,
      coCd: emp.coCd,
    });
    const linkKey = link?.linkKey;
    if (!linkKey) throw new Error("linkKey 없음");

    await call("/system/apiUtilEap/SetEnageGroup", {
      approKey,
      formDTp: def.formDTp,
      formId: def.formId,
      linkKey,
      formNm: def.formNm,
      docTitle: titleDc,
      contents: "",
      contentsApi:
        "/human/attendapplication/interlock/getInterlockFormContents",
      statusApi: "/human/attendapplication/interlock/setInterlockSync",
      dummy1: "",
      link: "",
      vPCoCd: emp.coCd,
      coCd: emp.coCd,
    });
    await call("/human/openapi/attendapplication/saveLinkKey", {
      linkKey,
      appSq: created.appSq,
      coCd: emp.coCd,
      appDt: created.appDt,
    });

    return {
      appSq: created.appSq,
      appDt: created.appDt,
      titleDc,
      approKey,
      url: approvalPopupUrl({
        formId: def.formId,
        approKey,
        popupUUID: randomUUID(),
      }),
    };
  } catch {
    return {
      appSq: created.appSq,
      appDt: created.appDt,
      titleDc,
      url: HPD0110_URL,
      warning:
        "신청서는 만들었지만 결재 화면을 바로 열지 못했어요. 근태신청 목록에서 이어서 상신해 주세요.",
    };
  }
}
