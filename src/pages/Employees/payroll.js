export function computeSalary(employee, attendanceLogs, settings, year, month) {
  const baseSalary = employee.salary || 0;

  const {
    expectedDailyHours      = 8,
    expectedLoginTime       = '09:30',
    expectedLogoutTime      = '18:30',
    lateArrivalThreshold    = 15,
    earlyDepartureThreshold = 15,
    hourlyDeductionRate     = 50,
    lateArrivalRate         = 0,
    earlyDepartureRate      = 0,
    freeLeavePerMonth       = 1,
    leavePenaltyAmount      = 200,
    leavePenaltyEnabled     = true,
    shortHoursPenaltyEnabled    = true,
    lateArrivalPenaltyEnabled   = true,
    earlyDeparturePenaltyEnabled = true,
  } = settings;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [expLoginH, expLoginM] = expectedLoginTime.split(':').map(Number);
  const [expLogoutH, expLogoutM] = expectedLogoutTime.split(':').map(Number);
  const expLoginMins  = expLoginH  * 60 + expLoginM;
  const expLogoutMins = expLogoutH * 60 + expLogoutM;

  let totalWorkMinutes   = 0;
  let leaveCount         = 0;
  let presentDays        = 0;
  let lateCount          = 0;
  let earlyDepartureCount = 0;
  let shortHoursMins     = 0;
  let lateMinutes        = 0;
  let earlyMinutes       = 0;
  const breakdownByDay   = [];

  attendanceLogs.forEach(log => {
    if (log.status === 'leave') {
      leaveCount++;
      breakdownByDay.push({ date: log.date, type: 'leave', workMins: 0, late: false, early: false });
      return;
    }
    if (!log.loginTime || !log.logoutTime) return;

    presentDays++;
    const loginDate  = new Date(log.loginTime);
    const logoutDate = new Date(log.logoutTime);

    // Total break time
    const breakMins = (log.breaks || [])
      .filter(b => b.startTime && b.endTime)
      .reduce((s, b) => s + (new Date(b.endTime) - new Date(b.startTime)) / 60000, 0);

    const grossWorkMins = (logoutDate - loginDate) / 60000;
    const netWorkMins   = Math.max(0, grossWorkMins - breakMins);
    totalWorkMinutes   += netWorkMins;

    // Expected daily hours shortfall
    const expectedMins = expectedDailyHours * 60;
    if (netWorkMins < expectedMins) {
      shortHoursMins += (expectedMins - netWorkMins);
    }

    // Late arrival
    const loginMins = loginDate.getHours() * 60 + loginDate.getMinutes();
    const isLate    = loginMins > expLoginMins + lateArrivalThreshold;
    if (isLate) {
      lateCount++;
      lateMinutes += (loginMins - expLoginMins - lateArrivalThreshold);
    }

    // Early departure
    const logoutMins = logoutDate.getHours() * 60 + logoutDate.getMinutes();
    const isEarly    = logoutMins < expLogoutMins - earlyDepartureThreshold;
    if (isEarly) {
      earlyDepartureCount++;
      earlyMinutes += (expLogoutMins - earlyDepartureThreshold - logoutMins);
    }

    breakdownByDay.push({
      date: log.date,
      type: 'present',
      workMins: Math.round(netWorkMins),
      late: isLate,
      early: isEarly,
      loginTime: log.loginTime,
      logoutTime: log.logoutTime,
      breakMins: Math.round(breakMins),
    });
  });

  // ── Penalty Calculation ────────────────────────────────────────────────────
  const penalties = [];

  if (shortHoursPenaltyEnabled && shortHoursMins > 0) {
    const shortHrs = shortHoursMins / 60;
    const deduction = Math.round(shortHrs * hourlyDeductionRate);
    if (deduction > 0) {
      penalties.push({
        id: 'short_hours',
        type: 'Short Work Hours',
        description: `${shortHrs.toFixed(1)} hrs short across ${presentDays} working days`,
        amount: deduction,
        removed: false,
      });
    }
  }

  if (lateArrivalPenaltyEnabled && lateCount > 0) {
    const deduction = lateArrivalRate > 0
      ? Math.round(lateCount * lateArrivalRate)
      : Math.round((lateMinutes / 60) * hourlyDeductionRate);
    if (deduction > 0) {
      penalties.push({
        id: 'late_arrival',
        type: 'Late Arrivals',
        description: `${lateCount} late arrival${lateCount > 1 ? 's' : ''} (${Math.round(lateMinutes)} mins total)`,
        amount: deduction,
        removed: false,
      });
    }
  }

  if (earlyDeparturePenaltyEnabled && earlyDepartureCount > 0) {
    const deduction = earlyDepartureRate > 0
      ? Math.round(earlyDepartureCount * earlyDepartureRate)
      : Math.round((earlyMinutes / 60) * hourlyDeductionRate);
    if (deduction > 0) {
      penalties.push({
        id: 'early_departure',
        type: 'Early Departures',
        description: `${earlyDepartureCount} early departure${earlyDepartureCount > 1 ? 's' : ''} (${Math.round(earlyMinutes)} mins total)`,
        amount: deduction,
        removed: false,
      });
    }
  }

  if (leavePenaltyEnabled && leaveCount > freeLeavePerMonth) {
    const extraLeaves = leaveCount - freeLeavePerMonth;
    const deduction   = extraLeaves * leavePenaltyAmount;
    penalties.push({
      id: 'leave_excess',
      type: 'Excess Leaves',
      description: `${leaveCount} leaves (${freeLeavePerMonth} free, ${extraLeaves} penalised)`,
      amount: deduction,
      removed: false,
    });
  }

  const totalPenalties = penalties.filter(p => !p.removed).reduce((s, p) => s + p.amount, 0);
  const netSalary      = Math.max(0, baseSalary - totalPenalties);

  return {
    baseSalary,
    presentDays,
    leaveCount,
    lateCount,
    earlyDepartureCount,
    totalWorkMinutes: Math.round(totalWorkMinutes),
    penalties,
    totalPenalties,
    netSalary,
    breakdownByDay,
    daysInMonth,
  };
}

