import test from "node:test";
import assert from "node:assert/strict";

const {
  LEAVE_KINDS,
  toHhmm,
  toTimeInput,
  ymd,
  pickDateRange,
  previewDateRange,
  inDateRange,
  eachYmd,
  isWeekend,
  holidaySetFromList,
  workingDaySegments,
  parsePendingCalendarRows,
  parsePendingApplications,
  mergeLeaves,
  collectValidationProblems,
  formatValidationMessage,
  resolveEmployee,
  newApproKey,
  approvalPopupUrl,
  buildAppItem,
  applyAnnualLeave,
  HPD0110_URL,
} = await import("../lib/leave.js");

test("시각 문자열을 HHmm 으로 맞춘다", () => {
  assert.equal(toHhmm("09:00"), "0900");
  assert.equal(toHhmm("9:00"), "0900");
  assert.equal(toHhmm("1400"), "1400");
  assert.equal(toTimeInput("0900"), "09:00");
});

test("날짜 range 클릭은 두 번으로 구간을 정한다", () => {
  const first = pickDateRange(
    { start: "20260913", end: "20260913", anchor: null },
    "20260914",
  );
  assert.deepEqual(first, {
    start: "20260914",
    end: "20260914",
    anchor: "20260914",
  });
  const range = pickDateRange(first, "20260916");
  assert.deepEqual(range, { start: "20260914", end: "20260916", anchor: null });
  const reverse = pickDateRange(first, "20260910");
  assert.deepEqual(reverse, {
    start: "20260910",
    end: "20260914",
    anchor: null,
  });
  assert.equal(inDateRange("20260915", range.start, range.end), true);
  assert.equal(inDateRange("20260917", range.start, range.end), false);
  assert.deepEqual(previewDateRange(first, "20260918"), {
    start: "20260914",
    end: "20260918",
  });
});

test("공휴일·주말이 끼면 연속 근무일 구간으로 나눈다", () => {
  assert.deepEqual(eachYmd("20260810", "20260813"), [
    "20260810",
    "20260811",
    "20260812",
    "20260813",
  ]);
  assert.equal(isWeekend("20260815"), true);
  assert.deepEqual(
    [...holidaySetFromList([{ holiDt: "20260812", holiYn: "Y" }])],
    ["20260812"],
  );
  // 10~13일(월~목), 12일이 공휴일 → 10~11 / 13
  assert.deepEqual(workingDaySegments("20260810", "20260813", ["20260812"]), [
    { start: "20260810", end: "20260811", days: 2 },
    { start: "20260813", end: "20260813", days: 1 },
  ]);
});

test("결재 진행 중인 신청만 휴가 목록으로 뽑는다", () => {
  const pending = parsePendingCalendarRows([
    {
      approState: "0",
      appSq: "625",
      atDt: "20260921",
      atCdNm: "리프레시휴가",
      atCd: "1016",
      nextEmpNm: "한민웅",
    },
    {
      approState: "0",
      appSq: "625",
      atDt: "20260922",
      atCdNm: "리프레시휴가",
      atCd: "1016",
      nextEmpNm: "한민웅",
    },
    {
      approState: "1",
      appSq: "100",
      atDt: "20260923",
      atCdNm: "연차",
      atCd: "1101",
    },
  ]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].pending, true);
  assert.equal(pending[0].name, "리프레시휴가");
  assert.deepEqual(pending[0].dates, ["20260921", "20260922"]);
  assert.equal(pending[0].nextEmpNm, "한민웅");
  const merged = mergeLeaves(
    [{ start: "20260910", end: "20260910", name: "연차" }],
    pending,
  );
  assert.equal(merged.length, 2);
  const wrapped = parsePendingCalendarRows({
    resultData: [
      {
        approState: "0",
        appSq: "1",
        atDt: "20260921",
        atCdNm: "연차",
      },
    ],
  });
  assert.equal(wrapped[0].name, "연차");
  const personal = parsePendingApplications({
    atPopUpDetailInfos: [
      {
        attendApplications: [
          {
            approState: "0",
            startDt: "20260921",
            endDt: "20260921",
            atNm: "복지휴가",
          },
        ],
      },
    ],
  });
  assert.equal(personal[0].name, "복지휴가");
});

test("검증 실패 배열을 사람 말로 바꾼다", () => {
  const problems = collectValidationProblems({
    insufficientAnnualLeaveList: [{ empCd: "1" }],
    duplicateSubmittedApplicationDetails: [],
  });
  assert.deepEqual(Object.keys(problems), ["insufficientAnnualLeaveList"]);
  assert.equal(formatValidationMessage(problems), "잔여 연차가 부족해요.");
});

test("직원 식별자는 baseInfo 를 우선하고 identity 로 채운다", () => {
  const emp = resolveEmployee(
    {
      employee: {
        coCd: "1000",
        empCd: "2021080202",
        korNm: "김현우",
        deptCd: "3210",
        deptNm: "에듀스쿼드",
      },
    },
    { empCd: "fallback", empName: "나" },
  );
  assert.equal(emp.empCd, "2021080202");
  assert.equal(emp.korNm, "김현우");
  assert.equal(emp.deptCd, "3210");
});

test("approKey 와 결재 팝업 URL 을 만든다", () => {
  const key = newApproKey(() => "abcd");
  assert.match(key, /^ERP_[0-9a-f-]+$/);
  const url = approvalPopupUrl({
    formId: "249",
    approKey: key,
    popupUUID: "uuid-1",
  });
  assert.equal(url.includes("formId=249"), true);
  assert.equal(url.includes("callComp=UBAP001"), true);
  assert.equal(url.includes(key), true);
});

test("APP_ITEM 은 서버 근무제와 사용자 시각을 함께 담는다", () => {
  const item = buildAppItem({
    emp: {
      coCd: "1000",
      empCd: "1",
      korNm: "홍",
      deptCd: "3210",
      deptNm: "팀",
    },
    def: LEAVE_KINDS["연차"],
    startDt: "20260914",
    endDt: "20260915",
    tm: {
      startTm: "0900",
      endTm: "1800",
      groupCd: "F100",
      timeCd: "7730",
      workTimeList: [
        { atCd: "9202", worktimeFg: "1", wksdTm: "0730", wkedTm: "2200" },
      ],
    },
    startTm: "1000",
    endTm: "1700",
    appDy: 2,
    appTm: 960,
    ycUseCnt: 2,
  });
  assert.equal(item.startTm, "1000");
  assert.equal(item.endTm, "1700");
  assert.equal(item.comeStTm, "0730");
  assert.equal(item.appDy, "2");
  assert.equal(item.workTp, "1");
});

test("연차 신청은 create 후 결재 팝업 URL 을 주고 상신 API 는 부르지 않는다", async () => {
  const calls = [];
  const call = async (path, body) => {
    calls.push({ path, body });
    if (path.endsWith("getApplicationBaseInfo")) {
      return {
        employee: {
          coCd: "1000",
          empCd: "2021080202",
          korNm: "김현우",
          deptCd: "3210",
          deptNm: "에듀",
        },
      };
    }
    if (path.endsWith("getStartTmEndTmByWorkType")) {
      return {
        startTm: "0900",
        endTm: "1800",
        workTp: "8",
        groupCd: "F100",
        timeCd: "7730",
        workTimeList: [],
      };
    }
    if (path.endsWith("calculateApplicationDays")) {
      return {
        applicationDaysCnt: 1,
        applicationMinutes: 480,
        dailyAppTm: 480,
        ycUseCnt: 1,
      };
    }
    if (path.endsWith("validateNew")) return {};
    if (path.endsWith("0hr00011")) return "[에듀 김현우] 연차신청서";
    if (path.endsWith("create"))
      return { appSq: 409, appDt: "20260913", approState: "2" };
    if (path.endsWith("GetLinkKey"))
      return { linkKey: "1000_HPD0110_20260913_2021080202_0001" };
    if (path.endsWith("SetEnageGroup")) return { approState: "2" };
    if (path.endsWith("saveLinkKey")) return {};
    throw new Error("unexpected " + path);
  };

  const result = await applyAnnualLeave(call, {
    identity: { empCd: "2021080202", coCd: "1000" },
    kind: "연차",
    startDt: "2026-09-14",
    endDt: "2026-09-14",
    startTm: "09:00",
    endTm: "18:00",
    now: new Date(2026, 8, 13),
    randomUUID: () => "uuid-test",
  });

  assert.equal(result.appSq, 409);
  assert.equal(result.url.includes("formId=249"), true);
  assert.equal(result.url.includes("uuid-test"), true);
  assert.equal(
    calls.some((c) => c.path.includes("eap110A06")),
    false,
  );
  const create = calls.find((c) => c.path.endsWith("create"));
  assert.equal(create.body.applicationList[0].startTm, "0900");
  assert.equal(ymd(create.body.applicationList[0].startDt), "20260914");
});

test("연차 기간에 공휴일이 있으면 근무일 구간마다 나눠 신청한다", async () => {
  const calls = [];
  const call = async (path, body) => {
    calls.push({ path, body });
    if (path.endsWith("getApplicationBaseInfo"))
      return { employee: { empCd: "1", coCd: "1000" } };
    if (path.endsWith("getStartTmEndTmByWorkType")) {
      return {
        startTm: "0900",
        endTm: "1800",
        workTp: "8",
        groupCd: "F100",
        timeCd: "7730",
        workTimeList: [],
      };
    }
    if (path.endsWith("calculateApplicationDays")) {
      const days = body.startDate === body.endDate ? 1 : 2;
      return {
        applicationDaysCnt: days,
        applicationMinutes: days * 480,
        dailyAppTm: 480,
        ycUseCnt: days,
        holidayList: [{ holiDt: "20260812", holiYn: "Y" }],
      };
    }
    if (path.endsWith("validateNew")) return {};
    if (path.endsWith("getHolidayList"))
      return [{ holiDt: "20260812", holiYn: "Y" }];
    if (path.endsWith("0hr00011")) return "제목";
    if (path.endsWith("create")) return { appSq: 1, appDt: "20260810" };
    if (path.endsWith("GetLinkKey")) return { linkKey: "k" };
    if (path.endsWith("SetEnageGroup")) return {};
    if (path.endsWith("saveLinkKey")) return {};
    throw new Error("unexpected " + path);
  };
  await applyAnnualLeave(call, {
    identity: { empCd: "1", coCd: "1000" },
    kind: "연차",
    startDt: "20260810",
    endDt: "20260813",
  });
  const create = calls.find((c) => c.path.endsWith("create"));
  const list = create.body.applicationList;
  assert.equal(list.length, 2);
  assert.equal(list[0].startDt, "20260810");
  assert.equal(list[0].endDt, "20260811");
  assert.equal(list[1].startDt, "20260813");
  assert.equal(list[1].endDt, "20260813");
});

test("검증 실패면 create 를 보내지 않는다", async () => {
  const calls = [];
  const call = async (path) => {
    calls.push(path);
    if (path.endsWith("getApplicationBaseInfo"))
      return { employee: { empCd: "1", coCd: "1000" } };
    if (path.endsWith("getStartTmEndTmByWorkType")) {
      return {
        startTm: "0900",
        endTm: "1800",
        workTp: "8",
        groupCd: "F100",
        timeCd: "7730",
      };
    }
    if (path.endsWith("calculateApplicationDays")) {
      return {
        applicationDaysCnt: 1,
        applicationMinutes: 480,
        dailyAppTm: 480,
        ycUseCnt: 1,
      };
    }
    if (path.endsWith("validateNew"))
      return { insufficientAnnualLeaveList: [{}] };
    throw new Error("unexpected " + path);
  };
  await assert.rejects(
    () =>
      applyAnnualLeave(call, {
        identity: { empCd: "1", coCd: "1000" },
        kind: "연차",
        startDt: "20260914",
        endDt: "20260914",
      }),
    /잔여 연차/,
  );
  assert.equal(
    calls.some((p) => p.endsWith("create")),
    false,
  );
});

test("결재 연동이 실패하면 근태신청 화면 URL 로 넘긴다", async () => {
  const call = async (path) => {
    if (path.endsWith("getApplicationBaseInfo"))
      return { employee: { empCd: "1", coCd: "1000" } };
    if (path.endsWith("getStartTmEndTmByWorkType")) {
      return {
        startTm: "0900",
        endTm: "1800",
        workTp: "8",
        groupCd: "F100",
        timeCd: "7730",
      };
    }
    if (path.endsWith("calculateApplicationDays")) {
      return {
        applicationDaysCnt: 1,
        applicationMinutes: 480,
        dailyAppTm: 480,
        ycUseCnt: 1,
      };
    }
    if (path.endsWith("validateNew")) return {};
    if (path.endsWith("0hr00011")) return "제목";
    if (path.endsWith("create")) return { appSq: 1, appDt: "20260913" };
    if (path.endsWith("GetLinkKey")) throw new Error("boom");
    throw new Error("unexpected " + path);
  };
  const result = await applyAnnualLeave(call, {
    identity: { empCd: "1", coCd: "1000" },
    kind: "오전반차",
    startDt: "20260914",
  });
  assert.equal(result.url, HPD0110_URL);
  assert.match(result.warning, /결재 화면/);
});
