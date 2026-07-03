const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.DASHBOARD_CONFIG;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusLabels = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  checked_in: "เช็คอินแล้ว",
  checked_out: "เช็คเอาท์แล้ว",
  cancelled: "ยกเลิกแล้ว",
  no_show: "ไม่มาเข้าพัก",
};

const roomStatusLabels = {
  available: "พร้อมขาย",
  maintenance: "ซ่อมบำรุง",
  closed: "ปิดใช้งาน",
};

const sourceLabels = {
  line: "LINE",
  walk_in: "Walk-in",
  ota: "OTA",
  staff: "Staff",
};

const bookingStatuses = Object.keys(statusLabels);

const state = {
  session: null,
  profile: null,
  branches: [],
  bookings: [],
  rooms: [],
  roomTypes: [],
  report: null,
  selectedBooking: null,
};

const el = (id) => document.getElementById(id);

function money(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function guestName(guest) {
  return [guest?.first_name, guest?.last_name].filter(Boolean).join(" ") || guest?.display_name || "-";
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function showMessage(text, type = "error") {
  const box = el("global-msg");
  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = false;
  setTimeout(() => {
    box.hidden = true;
  }, 5000);
}

function setLoading(button, loadingText) {
  const original = button.textContent;
  button.disabled = true;
  button.dataset.originalText = original;
  button.textContent = loadingText;
}

function clearLoading(button) {
  button.disabled = false;
  button.textContent = button.dataset.originalText || button.textContent;
  window.lucide?.createIcons();
}

function fillSelect(select, rows, getLabel, includeAllLabel = null) {
  select.innerHTML = "";
  if (includeAllLabel) {
    const all = document.createElement("option");
    all.value = "";
    all.textContent = includeAllLabel;
    select.appendChild(all);
  }
  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.textContent = getLabel(row);
    select.appendChild(option);
  });
}

async function requireSession() {
  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session;
  if (!state.session) {
    el("login-view").hidden = false;
    el("app-view").hidden = true;
    return false;
  }
  el("login-view").hidden = true;
  el("app-view").hidden = false;
  return true;
}

async function loadProfile() {
  const userId = state.session.user.id;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, role, branch_id, branches(name)")
    .eq("id", userId)
    .single();
  if (error) throw error;
  state.profile = data;
  el("profile-name").textContent = data.full_name || state.session.user.email;
  el("profile-role").textContent = data.role === "ceo" ? "CEO" : data.role === "manager" ? "Manager" : "Staff";
}

async function loadBranches() {
  let query = supabaseClient.from("branches").select("id, name, address").eq("is_active", true).order("name");
  if (state.profile.role !== "ceo" && state.profile.branch_id) {
    query = query.eq("id", state.profile.branch_id);
  }
  const { data, error } = await query;
  if (error) throw error;
  state.branches = data || [];
  const branchText =
    state.profile.role === "ceo"
      ? "เห็นทุกสาขา"
      : state.profile.branches?.name || state.branches[0]?.name || "ยังไม่ได้ผูกสาขา";
  el("branch-label").textContent = branchText;
  fillSelect(el("branch-filter"), state.branches, (b) => b.name, state.profile.role === "ceo" ? "ทุกสาขา" : null);
  fillSelect(el("new-branch"), state.branches, (b) => b.name);
  fillSelect(el("room-branch-filter"), state.branches, (b) => b.name, state.profile.role === "ceo" ? "ทุกสาขา" : null);
  fillSelect(el("report-branch-filter"), state.branches, (b) => b.name, state.profile.role === "ceo" ? "ทุกสาขา" : null);
}

async function loadRoomTypes(branchId) {
  if (!branchId) {
    state.roomTypes = [];
    fillSelect(el("new-room-type"), [], (r) => r.name);
    return;
  }
  const { data, error } = await supabaseClient
    .from("room_types")
    .select("id, branch_id, code, name, base_price, capacity")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("base_price");
  if (error) throw error;
  state.roomTypes = data || [];
  fillSelect(el("new-room-type"), state.roomTypes, (r) => `${r.name} (${money(r.base_price)}/คืน)`);
}

async function loadBookings() {
  let query = supabaseClient
    .from("bookings")
    .select(
      "id, booking_ref, branch_id, guest_id, room_type_id, room_id, check_in, check_out, num_guests, status, total_amount, source, notes, created_at, guests(id, first_name, last_name, display_name, phone, email, nationality), branches(id, name), room_types(id, name, code), rooms(id, room_number)",
    )
    .order("check_in", { ascending: true });

  const branchId = el("branch-filter").value;
  const status = el("status-filter").value;
  const dateFrom = el("date-from").value;
  const dateTo = el("date-to").value;

  if (branchId) query = query.eq("branch_id", branchId);
  if (status) query = query.eq("status", status);
  if (dateFrom) query = query.gte("check_out", dateFrom);
  if (dateTo) query = query.lte("check_in", dateTo);

  const { data, error } = await query;
  if (error) throw error;
  state.bookings = data || [];
  renderBookings();
}

function renderBookings() {
  const rows = el("booking-rows");
  rows.innerHTML = "";

  if (!state.bookings.length) {
    rows.innerHTML = `<tr><td colspan="7">ยังไม่มีรายการตามเงื่อนไขที่เลือก</td></tr>`;
    updateMetrics();
    return;
  }

  state.bookings.forEach((booking) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${booking.booking_ref}</strong><br><small>${booking.branches?.name || ""}</small></td>
      <td>${guestName(booking.guests)}<br><small>${booking.guests?.phone || ""}</small></td>
      <td>${booking.check_in}<br>${booking.check_out}</td>
      <td>${booking.room_types?.name || "-"}<br><small>${booking.rooms?.room_number ? `ห้อง ${booking.rooms.room_number}` : "ยังไม่ assign"}</small></td>
      <td><span class="status-pill status-${booking.status}">${statusLabels[booking.status] || booking.status}</span></td>
      <td>${money(booking.total_amount)}</td>
      <td><button class="link-btn" data-booking-id="${booking.id}">เปิด</button></td>
    `;
    rows.appendChild(row);
  });

  rows.querySelectorAll("[data-booking-id]").forEach((button) => {
    button.addEventListener("click", () => openBookingDetail(button.dataset.bookingId));
  });
  updateMetrics();
}

function updateMetrics() {
  const today = todayIso();
  const arrivals = state.bookings.filter((b) => b.check_in === today && ["pending", "confirmed"].includes(b.status));
  const active = state.bookings.filter((b) => ["confirmed", "checked_in"].includes(b.status));
  const revenue = state.bookings
    .filter((b) => !["cancelled", "no_show"].includes(b.status))
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  el("metric-arrivals").textContent = arrivals.length;
  el("metric-active").textContent = active.length;
  el("metric-revenue").textContent = money(revenue);
}

async function loadRooms() {
  let query = supabaseClient
    .from("rooms")
    .select("id, branch_id, room_type_id, room_number, floor, status, branches(name), room_types(name)")
    .order("room_number");

  const branchId = el("room-branch-filter").value;
  const status = el("room-status-filter").value;
  if (branchId) query = query.eq("branch_id", branchId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  state.rooms = data || [];
  renderRooms();
}

function renderRooms() {
  const grid = el("room-grid");
  grid.innerHTML = "";
  if (!state.rooms.length) {
    grid.innerHTML = `<div class="room-tile">ยังไม่มีห้องตามเงื่อนไขที่เลือก</div>`;
    return;
  }
  state.rooms.forEach((room) => {
    const tile = document.createElement("div");
    tile.className = `room-tile ${room.status}`;
    tile.innerHTML = `
      <strong>ห้อง ${room.room_number}</strong>
      <div>${room.room_types?.name || "-"}</div>
      <small>${room.branches?.name || ""} · ชั้น ${room.floor || "-"}</small>
      <div><span class="status-pill status-${room.status}">${roomStatusLabels[room.status] || room.status}</span></div>
    `;
    grid.appendChild(tile);
  });
}

async function loadReport() {
  const { data, error } = await supabaseClient.rpc("get_hotel_report", {
    p_date_from: el("report-date-from").value,
    p_date_to: el("report-date-to").value,
    p_branch_id: el("report-branch-filter").value || null,
  });
  if (error) throw error;
  state.report = data;
  renderReport();
}

function renderReport() {
  const report = state.report;
  if (!report) return;
  const metrics = report.metrics || {};

  el("report-revenue").textContent = money(metrics.booked_revenue);
  el("report-occupancy").textContent = percent(metrics.occupancy_rate);
  el("report-adr").textContent = money(metrics.adr);
  el("report-revpar").textContent = money(metrics.revpar);
  el("report-bookings").textContent = metrics.total_bookings || 0;
  el("report-repeat").textContent = metrics.repeat_guest_count || 0;

  const branchNames = (report.branch_scope || []).map((branch) => branch.name).join(", ") || "-";
  el("report-scope").textContent = `${branchNames} · ${report.date_from} ถึง ${report.date_to}`;

  renderDailyChart(report.daily || []);
  renderBreakdown(
    el("source-breakdown"),
    report.source_breakdown || [],
    (row) => sourceLabels[row.source] || row.source,
    (row) => `${row.bookings || 0} booking · ${money(row.revenue)}`,
    "revenue",
  );
  renderBreakdown(
    el("room-type-breakdown"),
    report.room_type_breakdown || [],
    (row) => row.room_type || "-",
    (row) => `${row.occupied_room_nights || 0} room-night · ${money(row.revenue)}`,
    "occupied_room_nights",
  );
}

function renderDailyChart(rows) {
  const chart = el("daily-chart");
  chart.innerHTML = "";
  if (!rows.length) {
    chart.innerHTML = `<div class="room-tile">ยังไม่มีข้อมูลรายวันในช่วงนี้</div>`;
    return;
  }
  const maxOccupied = Math.max(...rows.map((row) => Number(row.occupied_rooms || 0)), 1);
  rows.forEach((row) => {
    const bar = document.createElement("div");
    bar.className = "daily-bar";
    const height = Math.max((Number(row.occupied_rooms || 0) / maxOccupied) * 150, 4);
    const label = String(row.date).slice(5);
    bar.title = `${row.date}: ${row.occupied_rooms || 0} ห้อง · ${money(row.revenue)}`;
    bar.innerHTML = `
      <div class="daily-bar-fill" style="height:${height}px"></div>
      <small>${label}</small>
    `;
    chart.appendChild(bar);
  });
}

function renderBreakdown(container, rows, titleFn, valueFn, metricKey) {
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = `<div class="room-tile">ยังไม่มีข้อมูล</div>`;
    return;
  }
  const maxValue = Math.max(...rows.map((row) => Number(row[metricKey] || 0)), 1);
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    const width = Math.max((Number(row[metricKey] || 0) / maxValue) * 100, 3);
    item.innerHTML = `
      <div class="breakdown-row">
        <strong>${titleFn(row)}</strong>
        <span>${valueFn(row)}</span>
      </div>
      <div class="breakdown-track"><div class="breakdown-fill" style="width:${width}%"></div></div>
    `;
    container.appendChild(item);
  });
}

async function openBookingDetail(bookingId) {
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return;
  state.selectedBooking = booking;

  await supabaseClient.rpc("log_audit", {
    p_action: "view",
    p_table: "guests",
    p_id: booking.guest_id,
    p_meta: { booking_id: booking.id, source: "dashboard_detail" },
  });

  el("detail-ref").textContent = booking.booking_ref;
  el("detail-guest").textContent = guestName(booking.guests);
  el("detail-body").innerHTML = `
    ${detailItem("เบอร์โทร", booking.guests?.phone || "-")}
    ${detailItem("อีเมล", booking.guests?.email || "-")}
    ${detailItem("สัญชาติ", booking.guests?.nationality || "-")}
    ${detailItem("สาขา", booking.branches?.name || "-")}
    ${detailItem("ประเภทห้อง", booking.room_types?.name || "-")}
    ${detailItem("วันพัก", `${booking.check_in} ถึง ${booking.check_out}`)}
    ${detailItem("จำนวนแขก", `${booking.num_guests} คน`)}
    ${detailItem("ยอด", money(booking.total_amount))}
    ${detailItem("หมายเหตุ", booking.notes || "-")}
  `;

  const statusSelect = el("detail-status");
  statusSelect.innerHTML = "";
  bookingStatuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = statusLabels[status];
    option.selected = status === booking.status;
    statusSelect.appendChild(option);
  });

  await fillAssignableRooms(booking);
  el("booking-dialog").showModal();
  window.lucide?.createIcons();
}

function detailItem(label, value) {
  return `<div class="detail-item"><small>${label}</small><strong>${value}</strong></div>`;
}

async function fillAssignableRooms(booking) {
  const { data, error } = await supabaseClient
    .from("rooms")
    .select("id, room_number, status")
    .eq("branch_id", booking.branch_id)
    .eq("room_type_id", booking.room_type_id)
    .order("room_number");
  if (error) throw error;

  const select = el("detail-room");
  select.innerHTML = `<option value="">ยังไม่ assign</option>`;
  (data || []).forEach((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = `ห้อง ${room.room_number}${room.status !== "available" ? ` (${roomStatusLabels[room.status]})` : ""}`;
    option.selected = room.id === booking.room_id;
    option.disabled = room.status !== "available" && room.id !== booking.room_id;
    select.appendChild(option);
  });
}

async function saveBookingDetail() {
  const booking = state.selectedBooking;
  if (!booking) return;
  const updates = {
    status: el("detail-status").value,
    room_id: el("detail-room").value || null,
  };
  const { error } = await supabaseClient.from("bookings").update(updates).eq("id", booking.id);
  if (error) {
    showMessage(error.message.includes("bookings_no_room_overlap") ? "ห้องนี้ถูกจองทับช่วงวันแล้ว" : "บันทึกไม่สำเร็จ");
    return;
  }
  await supabaseClient.rpc("log_audit", {
    p_action: "update",
    p_table: "bookings",
    p_id: booking.id,
    p_meta: { source: "dashboard_detail", updates },
  });
  el("booking-dialog").close();
  showMessage("บันทึกการจองแล้ว", "success");
  await loadBookings();
  await loadRooms();
}

async function createBooking(event) {
  event.preventDefault();
  const button = el("create-booking-btn");
  setLoading(button, "กำลังบันทึก...");
  const payload = {
    p_branch_id: el("new-branch").value,
    p_room_type_id: el("new-room-type").value,
    p_check_in: el("new-check-in").value,
    p_check_out: el("new-check-out").value,
    p_num_guests: Number(el("new-num-guests").value),
    p_first_name: el("new-first-name").value,
    p_last_name: el("new-last-name").value,
    p_phone: el("new-phone").value || null,
    p_email: el("new-email").value || null,
    p_nationality: el("new-nationality").value || null,
    p_status: el("new-status").value,
    p_notes: el("new-notes").value || null,
  };

  try {
    const { error } = await supabaseClient.rpc("create_staff_booking", payload);
    if (error) throw error;
    event.target.reset();
    el("new-num-guests").value = "1";
    showMessage("สร้างการจองแล้ว", "success");
    await loadRoomTypes(el("new-branch").value);
    await loadBookings();
    switchTab("bookings");
  } catch (error) {
    const messages = {
      no_availability: "ห้องเต็มในช่วงวันที่เลือกแล้ว",
      invalid_dates: "วันเช็คเอาท์ต้องหลังวันเช็คอิน",
      forbidden_branch: "บัญชีนี้ไม่มีสิทธิ์สร้างการจองสาขานี้",
    };
    showMessage(messages[error.message] || "สร้างการจองไม่สำเร็จ");
  } finally {
    clearLoading(button);
  }
}

function switchTab(tabName) {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tabName}`;
  });
  el("page-title").textContent =
    tabName === "bookings"
      ? "การจอง"
      : tabName === "new-booking"
      ? "เพิ่มการจอง"
      : tabName === "rooms"
      ? "ห้องพัก"
      : "รายงาน";
}

function setDefaultDates() {
  const today = todayIso();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  el("date-from").value = today;
  el("date-to").value = "";
  el("new-check-in").min = today;
  el("new-check-out").min = today;
  el("new-check-in").value = today;
  el("new-check-out").value = tomorrow;
  const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  el("report-date-from").value = thirtyDaysAgo;
  el("report-date-to").value = today;
}

function wireEvents() {
  el("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    el("login-msg").hidden = true;
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: el("login-email").value,
      password: el("login-password").value,
    });
    if (error) {
      el("login-msg").textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
      el("login-msg").hidden = false;
      return;
    }
    await init();
  });

  el("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    state.session = null;
    await requireSession();
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  ["branch-filter", "status-filter", "date-from", "date-to"].forEach((id) => {
    el(id).addEventListener("change", () => loadBookings().catch((error) => showMessage(error.message)));
  });
  ["room-branch-filter", "room-status-filter"].forEach((id) => {
    el(id).addEventListener("change", () => loadRooms().catch((error) => showMessage(error.message)));
  });
  ["report-branch-filter", "report-date-from", "report-date-to"].forEach((id) => {
    el(id).addEventListener("change", () => loadReport().catch((error) => showMessage(error.message)));
  });

  el("new-branch").addEventListener("change", () => loadRoomTypes(el("new-branch").value));
  el("new-booking-form").addEventListener("submit", createBooking);
  el("save-detail-btn").addEventListener("click", saveBookingDetail);
  el("load-report-btn").addEventListener("click", () => loadReport().catch((error) => showMessage(error.message)));
  el("refresh-btn").addEventListener("click", () => refreshAll().catch((error) => showMessage(error.message)));
}

async function refreshAll() {
  await Promise.all([loadBookings(), loadRooms(), loadReport()]);
}

async function init() {
  const hasSession = await requireSession();
  if (!hasSession) {
    window.lucide?.createIcons();
    return;
  }
  try {
    setDefaultDates();
    await loadProfile();
    await loadBranches();
    if (state.branches[0]) {
      el("new-branch").value = state.branches[0].id;
      await loadRoomTypes(state.branches[0].id);
    }
    await refreshAll();
  } catch (error) {
    showMessage(error.message);
  } finally {
    window.lucide?.createIcons();
  }
}

wireEvents();
init();
