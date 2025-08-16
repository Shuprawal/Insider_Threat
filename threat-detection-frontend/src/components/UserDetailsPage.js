import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaUserCircle } from 'react-icons/fa';
import { FiEdit2 } from 'react-icons/fi';

import DashboardCharts from "./DashboardCharts";
import DateFilter from "./Date";
import SiteFooter from "./SiteFooter";
import { getToken } from "./authStorage";

// Export libs (text-first CV style)
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import {
  Document, Packer, Paragraph, HeadingLevel, ImageRun,
  Table, TableRow, TableCell, WidthType, AlignmentType
} from 'docx';

function UserDetailsPage() {
  const { userId, username } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [error, setError] = useState("");

  // Viewer (current logged-in user) + permission flag
  const [viewer, setViewer] = useState(null);
  const [canManage, setCanManage] = useState(false);

  const [alertPoints, setAlertPoints] = useState([]);
  const [pieLabels, setPieLabels] = useState([]);
  const [pieCounts, setPieCounts] = useState([]);
  const [barLabels, setBarLabels] = useState([]);
  const [barScores, setBarScores] = useState([]);
  const [barCounts, setBarCounts] = useState([]);
  const [barMode, setBarMode] = useState('score');
  const [groupBy, setGroupBy] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Activities
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activitiesLimit, setActivitiesLimit] = useState(100);
  const [isLoading, setIsLoading] = useState(false);

  // Only used to snapshot charts for export
  const chartsRef = useRef(null);

  // ---- Company header config ----
  const COMPANY = {
    name: 'Insider Monitor',
    logoUrl: '/logo.png',
  };

  const token = getToken();
  const cfg = { headers: { Authorization: `Bearer ${token}` } };

  // -------------- Helpers --------------
  const resolveAvatar = (pic) => {
    if (!pic) return null;
    if (/^https?:\/\//i.test(pic)) return pic;
    return `http://localhost:8000${pic.startsWith('/') ? '' : '/'}${pic}`;
  };

  const pad2 = (n) => String(n).padStart(2, '0');

  const formatDateTime = (val) => {
    if (!val) return '-';
    try {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return String(val);
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch {
      return String(val);
    }
  };

  const formatDateOnly = (d) => {
    if (!d || Number.isNaN(d.getTime?.())) return '-';
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  };

  const getCurrentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start, end };
  };

  const getEffectiveRange = () => {
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date('1970-01-01T00:00:00');
      const end = endDate ? new Date(endDate) : new Date();
      end.setHours(23, 59, 59, 999);
      return {
        start, end,
        label: `${formatDateOnly(start)} to ${formatDateOnly(end)}`,
        source: 'selected'
      };
    }
    const { start, end } = getCurrentMonthRange();
    return {
      start, end,
      label: `${formatDateOnly(start)} to ${formatDateOnly(end)}`,
      source: 'current-month'
    };
  };

  // -------- Fetch current viewer + compute permissions --------
  async function fetchViewer() {
    try {
      // Your urls.py shows: path('auth/me/', me_view, ...)
      const tryEndpoints = [
        'http://localhost:8000/auth/me/',
        // Optional fallback if you later mount it under /api/
        'http://localhost:8000/api/auth/me/',
      ];
      let me = null;
      for (const url of tryEndpoints) {
        try {
          const r = await axios.get(url, cfg);
          if (r?.data) { me = r.data; break; }
        } catch { /* try next */ }
      }
      if (!me) {
        setViewer(null);
        setCanManage(false);
        return;
      }
      const data = me?.user ? me.user : me;
      setViewer(data);

      const role = String(data?.role || '').toLowerCase();
      // CustomUser doesn't have is_staff; it DOES have is_superuser via PermissionsMixin
      const manage = !!(data?.is_superuser || role === 'admin' || role === 'superuser');
      setCanManage(manage);
    } catch {
      setViewer(null);
      setCanManage(false);
    }
  }

  async function fetchUser() {
    setError("");
    setIsLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      params.limit = activitiesLimit;

      if (userId) {
        const res = await axios.get(
          `http://localhost:8000/api/users/${userId}/detail/`,
          { ...cfg, params }
        );
        setUser(res.data.user);
        setAlertPoints(res.data.alertPoints || []);
        setPieLabels(res.data.pieLabels || []);
        setPieCounts(res.data.pieData || []);
        setBarLabels(res.data.barLabels || []);
        setBarScores(res.data.barScores || []);
        setBarCounts(res.data.barCounts || []);
        setGroupBy(res.data.groupBy || 'hour');
        setActivities(res.data.activities || []);
        setIsLoading(false);
        return;
      }

      const uname = String(username || '').trim();
      try {
        const byUname = await axios.get(
          `http://localhost:8000/api/users/by-username/${encodeURIComponent(uname)}/detail/`,
          { ...cfg, params }
        );
        const d = byUname.data;
        setUser(d.user);
        setAlertPoints(d.alertPoints || []);
        setPieLabels(d.pieLabels || []);
        setPieCounts(d.pieData || []);
        setBarLabels(d.barLabels || []);
        setBarScores(d.barScores || []);
        setBarCounts(d.barCounts || []);
        setGroupBy(d.groupBy || 'hour');
        setActivities(d.activities || []);
        setIsLoading(false);
        return;
      } catch {}

      const listResp = await axios.get(
        'http://localhost:8000/api/users/',
        { ...cfg, params: { username: uname } }
      );

      const items = Array.isArray(listResp.data)
        ? listResp.data
        : (listResp.data?.results || listResp.data?.users || []);

      const exact = items.find(
        u => String(u.username || '').toLowerCase() === uname.toLowerCase()
      );

      if (!exact?.id) {
        throw new Error(`Exact user not found for "${uname}".`);
      }

      const detail = await axios.get(
        `http://localhost:8000/api/users/${exact.id}/detail/`,
        { ...cfg, params }
      );

      const d = detail.data;
      setUser(d.user);
      setAlertPoints(d.alertPoints || []);
      setPieLabels(d.pieLabels || []);
      setPieCounts(d.pieData || []);
      setBarLabels(d.barLabels || []);
      setBarScores(d.barScores || []);
      setBarCounts(d.barCounts || []);
      setGroupBy(d.groupBy || 'hour');
      setActivities(d.activities || []);
    } catch (err) {
      console.error('Error fetching user details:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load user.');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  // Fetch viewer once (IMPORTANT: don't comment this out)
  useEffect(() => {
    fetchViewer();
  }, []);

  // Fetch the profile data whenever inputs change
  useEffect(() => {
    fetchUser();
  }, [userId, username, startDate, endDate, activitiesLimit]);

  // -------- Guarded actions (respect canManage) --------
  const handleDelete = async () => {
    if (!user) return;
    if (!canManage) {
      alert("You don't have permission to delete users.");
      return;
    }
    const confirmDelete = window.confirm(`Are you sure you want to delete user: ${user.username}?`);
    if (!confirmDelete) return;

    try {
      await axios.delete(`http://localhost:8000/api/users/${user.id || userId}/delete/`, cfg);
      alert("User deleted successfully.");
      navigate("/users");
    } catch {
      alert("Failed to delete user.");
    }
  };

  const handleSuspendChange = async (e) => {
    if (!canManage) {
      e.target.value = user?.is_suspended ? 'Yes' : 'No';
      alert("You don't have permission to change suspension status.");
      return;
    }
    const newValue = e.target.value === 'Yes';
    try {
      await axios.put(`http://localhost:8000/api/users/${user.id || userId}/suspend/`, {
        is_suspended: newValue
      }, cfg);
      setUser(prev => ({ ...prev, is_suspended: newValue }));
    } catch {
      alert("Failed to update suspended status.");
    }
  };

  // ---- helpers for export assets ----
  const fetchImageAsDataURL = (url) =>
    new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

  const fetchImageAsArrayBuffer = async (url) => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      return await blob.arrayBuffer();
    } catch {
      return null;
    }
  };

  // ---------- TEXT-FIRST CV EXPORTS ----------
  const exportPDF = async () => {
    if (!user) return;

    const { start, end, label } = getEffectiveRange();

    const filteredActivities = (activities || []).filter(a => {
      const t = new Date(a.timestamp);
      return !Number.isNaN(t.getTime()) && t >= start && t <= end;
    });

    const topicTypes = Array.from(new Set(filteredActivities.map(a => a.activity_type || '—'))).filter(Boolean);

    const logoDataUrl = await fetchImageAsDataURL(COMPANY.logoUrl);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const marginL = 18;

    // ---- Cover page ----
    let y = 24;
    if (logoDataUrl) {
      const coverLogoW = 40;
      const coverLogoH = 40;
      pdf.addImage(logoDataUrl, 'PNG', marginL, y, coverLogoW, coverLogoH);
    }
    pdf.setFont('times', 'bold'); pdf.setFontSize(22);
    pdf.text(`${COMPANY.name}`, marginL + 48, y + 10);
    pdf.setFontSize(16);
    pdf.text(`User Report`, marginL + 48, y + 20);

    y += 54;
    pdf.setFont('times', 'normal'); pdf.setFontSize(12);
    pdf.text(`Username: ${user.username}`, marginL, y); y += 7;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';
    pdf.text(`Full name: ${fullName}`, marginL, y); y += 7;
    pdf.text(`Generated: ${formatDateTime(new Date())}`, marginL, y); y += 7;
    pdf.text(`Duration: ${label}`, marginL, y); y += 10;

    pdf.setFont('times', 'bold'); pdf.setFontSize(13);
    pdf.text('Topics in this report:', marginL, y); y += 7;
    pdf.setFont('times', 'normal'); pdf.setFontSize(12);
    const builtInTopics = ['Personal Information', 'Summary', 'Recent Activities', 'Charts & Diagrams'];
    [...builtInTopics, ...(topicTypes.length ? ['— Activity Types: ' + topicTypes.join(', ')] : [])].forEach(line => {
      pdf.text(`• ${line}`, marginL, y);
      y += 6;
    });

    // ---- Section: Personal Information ----
    pdf.addPage();
    y = 24;
    pdf.setFont('times', 'bold'); pdf.setFontSize(15);
    pdf.text('Personal Information', marginL, y); y += 8;
    pdf.setFont('times', 'normal'); pdf.setFontSize(11);

    const infoRows = [
      ['User ID', String(user.id ?? '—')],
      ['Email', user.email || '—'],
      ['Department', user.department || '—'],
      ['Role', user.role || '—'],
      ['Address', user.address || '—'],
      ['Account Created', formatDateTime(user.created_at)],
      ['Failed Login At', formatDateTime(user.failed_login_timestamp)],
      ['Active', user.is_active ? 'Yes' : 'No'],
      ['Suspended', user.is_suspended ? 'Yes' : 'No'],
    ];
    infoRows.forEach(([k, v]) => {
      if (y > 280) { pdf.addPage(); y = 24; }
      pdf.setFont('times', 'bold'); pdf.text(`${k}:`, marginL, y);
      pdf.setFont('times', 'normal'); pdf.text(String(v), marginL + 38, y);
      y += 6;
    });

    // ---- Section: Summary ----
    if (y > 260) { pdf.addPage(); y = 24; }
    y += 4;
    pdf.setFont('times', 'bold'); pdf.setFontSize(15);
    pdf.text('Summary', marginL, y); y += 8;
    pdf.setFont('times', 'normal'); pdf.setFontSize(11);
    const summaryLines = [
      `Duration: ${label}`,
      `Grouped by: ${groupBy || 'hour'}`,
      `Logs included: ${filteredActivities.length}`,
    ];
    summaryLines.forEach(t => { pdf.text(t, marginL, y); y += 6; });

    // ---- Section: Recent Activities (table) ----
    pdf.addPage();
    pdf.setFont('times', 'bold'); pdf.setFontSize(15);
    pdf.text('Recent Activities', marginL, 18);

    const tableBody = filteredActivities.map(a => ([
      formatDateTime(a.timestamp),
      a.activity_type || '—',
      a.details ? String(a.details) : '—',
      a.ip_address || '—',
      a.is_suspicious ? 'Yes' : 'No',
    ]));

    autoTable(pdf, {
      startY: 24,
      margin: { left: marginL, right: marginL },
      head: [['Time', 'Type', 'Details', 'IP', 'Suspicious']],
      body: tableBody,
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, halign: 'left' },
      styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 28 },
        2: { cellWidth: 90 },
        3: { cellWidth: 25 },
        4: { cellWidth: 18, halign: 'center' },
      },
      didDrawPage: () => {
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        const header = `${COMPANY.name} • User Report • ${label}`;
        pdf.text(header, marginL, 10);
        const str = `Page ${pdf.internal.getNumberOfPages()}`;
        pdf.text(str, 210 - marginL, 290, { align: 'right' });
      }
    });

    // ---- Section: Charts ----
    if (chartsRef?.current) {
      pdf.addPage();
      pdf.setFont('times', 'bold'); pdf.setFontSize(15);
      pdf.text('Charts & Diagrams', marginL, 18);

      const canvas = await html2canvas(chartsRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const img = canvas.toDataURL('image/png');
      const pageWidth = pdf.internal.pageSize.getWidth() - marginL * 2;
      const h = (canvas.height * pageWidth) / canvas.width;
      const maxH = 210 - 40;
      const drawH = Math.min(h, maxH);
      pdf.addImage(img, 'PNG', marginL, 26, pageWidth, drawH);
    }

    const fn = `user_${user.username}_cv_${label.replaceAll('-', '').replaceAll(' ', '').replaceAll('to', '-')}.pdf`;
    pdf.save(fn);
  };

  const dataUrlToArrayBuffer = (dataUrl) => {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  const exportDOCX = async () => {
    if (!user) return;

    const { start, end, label } = getEffectiveRange();

    const filteredActivities = (activities || []).filter(a => {
      const t = new Date(a.timestamp);
      return !Number.isNaN(t.getTime()) && t >= start && t <= end;
    });

    const logoBuf = await fetchImageAsArrayBuffer(COMPANY.logoUrl);

    const kv = (k, v) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: k, bold: true })] }),
        new TableCell({ children: [new Paragraph(String(v ?? '—'))] }),
      ]
    });

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';

    const infoTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        kv('Username', user.username),
        kv('Full name', fullName),
        kv('User ID', user.id),
        kv('Email', user.email),
        kv('Department', user.department),
        kv('Role', user.role),
        kv('Address', user.address),
        kv('Account Created', formatDateTime(user.created_at)),
        kv('Failed Login At', formatDateTime(user.failed_login_timestamp)),
        kv('Active', user.is_active ? 'Yes' : 'No'),
        kv('Suspended', user.is_suspended ? 'Yes' : 'No'),
      ]
    });

    const activityHeader = new TableRow({
      children: ['Time', 'Type', 'Details', 'IP', 'Suspicious'].map(h =>
        new TableCell({ children: [new Paragraph({ text: h, bold: true })] })
      )
    });

    const activityRows = filteredActivities.map(a => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(formatDateTime(a.timestamp))] }),
        new TableCell({ children: [new Paragraph(a.activity_type || '—')] }),
        new TableCell({ children: [new Paragraph(String(a.details || '—'))] }),
        new TableCell({ children: [new Paragraph(a.ip_address || '—')] }),
        new TableCell({ children: [new Paragraph(a.is_suspicious ? 'Yes' : 'No')] }),
      ]
    }));

    const activityTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [activityHeader, ...activityRows]
    });

    let chartParagraph = null;
    if (chartsRef?.current) {
      const canvas = await html2canvas(chartsRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const data = dataUrlToArrayBuffer(canvas.toDataURL('image/png'));
      const targetW = 600;
      const targetH = Math.round((canvas.height * targetW) / canvas.width);
      chartParagraph = new Paragraph({
        children: [new ImageRun({ data, transformation: { width: targetW, height: targetH } })],
        alignment: AlignmentType.CENTER
      });
    }

    const children = [];
    if (logoBuf) {
      children.push(
        new Paragraph({
          children: [new ImageRun({ data: logoBuf, transformation: { width: 120, height: 120 } })],
          alignment: AlignmentType.LEFT
        })
      );
    }

    children.push(
      new Paragraph({ text: `${COMPANY.name}`, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: `User Report`, heading: HeadingLevel.TITLE }),
      new Paragraph({ text: `Username: ${user.username}` }),
      new Paragraph({ text: `Full name: ${fullName}` }),
      new Paragraph({ text: `Generated: ${formatDateTime(new Date())}` }),
      new Paragraph({ text: `Duration: ${label}`, spacing: { after: 300 } }),
    );

    children.push(new Paragraph({ text: `Topics in this report:`, heading: HeadingLevel.HEADING_2 }));
    const builtInTopics = ['Personal Information', 'Summary', 'Recent Activities', 'Charts & Diagrams'];
    builtInTopics.forEach(t => children.push(new Paragraph(`• ${t}`)));
    children.push(new Paragraph({ text: '' }));

    children.push(new Paragraph({ text: 'Personal Information', heading: HeadingLevel.HEADING_2 }));
    children.push(infoTable);
    children.push(new Paragraph({ text: '' }));

    children.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph(`Duration: ${label}`));
    children.push(new Paragraph(`Grouped by: ${groupBy || 'hour'}`));
    children.push(new Paragraph(`Logs included: ${filteredActivities.length}`));
    children.push(new Paragraph({ text: '' }));

    children.push(new Paragraph({ text: 'Recent Activities', heading: HeadingLevel.HEADING_2 }));
    children.push(activityTable);
    children.push(new Paragraph({ text: '' }));

    if (chartParagraph) {
      children.push(new Paragraph({ text: 'Charts & Diagrams', heading: HeadingLevel.HEADING_2 }));
      children.push(chartParagraph);
    }

    const doc = new Document({
      sections: [{ properties: {}, children }]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fn = `user_${user.username}_cv_${label.replaceAll('-', '').replaceAll(' ', '').replaceAll('to', '-')}.docx`;
    a.href = url;
    a.download = fn;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- RENDER ----------
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)' }}>
        <div style={{ maxWidth: 1100, margin: '2rem auto', padding: '1rem' }}>
          <div style={{
            background: 'var(--im-surface)', border: '1px solid var(--im-border)',
            borderRadius: 16, padding: '1rem'
          }}>
            <h2 style={{ margin: 0 }}>User error</h2>
            <p style={{ color: 'var(--im-text-weak)' }}>{error}</p>
            <button onClick={() => navigate('/users')}
              style={{ padding: '.5rem .8rem', borderRadius: 10, border: '1px solid var(--im-border)' }}>
              ← Back to Users
            </button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)' }}>
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>Loading…</div>
        <SiteFooter />
      </div>
    );
  }

  const avatarUrl = resolveAvatar(user.profile_picture);
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const accountStatus = user.is_active ? 'Active' : 'Inactive';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1 }}>
        <div className="p-8" style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Export toolbar */}
          <div className="flex justify-end gap-2 mb-4">
            <button
              onClick={exportPDF}
              className="text-sm font-medium px-3 py-2 rounded"
              style={{ border: '1px solid var(--im-border)', background: 'var(--im-surface)', color: 'var(--im-text)' }}
            >
              ⬇️ Export CV (PDF)
            </button>
            <button
              onClick={exportDOCX}
              className="text-sm font-medium px-3 py-2 rounded"
              style={{ border: '1px solid var(--im-border)', background: 'var(--im-surface)', color: 'var(--im-text)' }}
            >
              ⬇️ Export CV (.docx)
            </button>
          </div>

          {/* Profile Card */}
          <div
            className="rounded-lg p-6 shadow-md mb-6"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--im-text)' }}>User Profile</h2>

            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${user.username} profile`}
                  crossOrigin="anonymous"
                  style={{
                    width: 88, height: 88, borderRadius: '999px', objectFit: 'cover',
                    border: '1px solid var(--im-border)', background: 'var(--im-surface)'
                  }}
                />
              ) : (
                <FaUserCircle size={88} style={{ color: 'var(--im-text-weak)' }} />
              )}

              <div style={{ lineHeight: 1.35 }}>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--im-text)', margin: 0 }}>
                  {fullName || user.username}
                </h3>
                {fullName && (
                  <div style={{ color: 'var(--im-text-weak)', fontSize: '.9rem' }}>
                    @{user.username}
                  </div>
                )}

                <div style={{ marginTop: '.4rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  <span style={{ border: '1px solid var(--im-border)', padding: '.2rem .5rem', borderRadius: 999, fontSize: '.8rem', color: 'var(--im-text-weak)' }}>
                    {user.role || 'Role: –'}
                  </span>
                  <span style={{ border: '1px solid var(--im-border)', padding: '.2rem .5rem', borderRadius: 999, fontSize: '.8rem', color: 'var(--im-text-weak)' }}>
                    {user.department || 'Department: –'}
                  </span>
                  <span style={{
                    border: '1px solid var(--im-border)', padding: '.2rem .6rem',
                    borderRadius: 999, fontSize: '.8rem',
                    color: user.is_active ? 'var(--im-text)' : 'var(--im-text-weak)',
                    background: user.is_active ? 'var(--im-surface-ghost, rgba(0,0,0,0.03))' : 'transparent'
                  }}>
                    {accountStatus}
                  </span>
                  {user.is_suspended && (
                    <span style={{ border: '1px solid var(--im-border)', padding: '.2rem .6rem', borderRadius: 999, fontSize: '.8rem', color: 'var(--im-danger)' }}>
                      Suspended
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div
            className="rounded-lg p-6 shadow-md mb-6"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--im-text)', margin: 0 }}>Personal Information</h3>

              {/* Only admins/superusers see the Edit button */}
              {canManage && (
                <button
                  className="flex items-center text-sm font-medium"
                  style={{ color: 'var(--im-accent)' }}
                  onClick={() => navigate(`/users/${user?.id || userId}/edit`)}
                >
                  Edit <FiEdit2 className="ml-1" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm" style={{ color: 'var(--im-text)' }}>
              <div><strong>User ID:</strong><br />{user.id}</div>
              <div><strong>Username:</strong><br />{user.username}</div>
              <div><strong>Email:</strong><br />{user.email}</div>

              <div><strong>First Name:</strong><br />{user.first_name || '-'}</div>
              <div><strong>Last Name:</strong><br />{user.last_name || '-'}</div>
              <div><strong>Address:</strong><br />{user.address || '-'}</div>

              <div><strong>Department:</strong><br />{user.department || '-'}</div>
              <div><strong>Role:</strong><br />{user.role || '-'}</div>
              <div><strong>Account Created:</strong><br />{formatDateTime(user.created_at)}</div>

              <div><strong>Failed Login At:</strong><br />{formatDateTime(user.failed_login_timestamp)}</div>
              <div><strong>Active:</strong><br />{user.is_active ? 'Yes' : 'No'}</div>

              <div className="col-span-1">
                <strong>Suspended:</strong><br />
                <select
                  value={user.is_suspended ? 'Yes' : 'No'}
                  onChange={handleSuspendChange}
                  className="border px-2 py-1 rounded"
                  style={{ background: 'var(--im-surface)', color: 'var(--im-text)', border: '1px solid var(--im-border)' }}
                  disabled={!canManage}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>

            {/* Only admins/superusers see the Delete button */}
            {canManage && (
              <div className="mt-6 text-right">
                <button
                  onClick={handleDelete}
                  className="text-white font-medium px-4 py-2 rounded"
                  style={{ background: '#ef4444' }}
                >
                  🗑️ Delete User
                </button>
              </div>
            )}
          </div>

          {/* Activities */}
          <div
            className="rounded-lg p-6 shadow-md mb-6"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--im-text)', margin: 0 }}>
                Recent Activities
              </h3>
              <div className="flex items-center gap-2">
                <label className="text-sm" style={{ color: 'var(--im-text-weak)' }}>
                  Show
                </label>
                <select
                  value={activitiesLimit}
                  onChange={(e) => setActivitiesLimit(Number(e.target.value))}
                  className="border px-2 py-1 rounded text-sm"
                  style={{ background: 'var(--im-surface)', color: 'var(--im-text)', border: '1px solid var(--im-border)' }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>

                <button
                  onClick={() => setActivitiesOpen(v => !v)}
                  className="font-medium px-3 py-2 rounded text-sm"
                  style={{ border: '1px solid var(--im-border)', background: 'var(--im-surface-ghost, rgba(0,0,0,0.02))', color: 'var(--im-text)' }}
                >
                  {activitiesOpen ? 'Hide' : 'Show'} Activities
                </button>
              </div>
            </div>

            {activitiesOpen && (
              <div>
                {isLoading ? (
                  <div style={{ color: 'var(--im-text-weak)' }}>Loading…</div>
                ) : activities.length === 0 ? (
                  <div style={{ color: 'var(--im-text-weak)' }}>No activities in this date range.</div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--im-border)' }}>
                    {activities.map((a) => (
                      <li key={a.id} className="py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm" style={{ color: 'var(--im-text)' }}>
                              <strong>{a.activity_type || 'Activity'}</strong>
                              {a.is_suspicious ? (
                                <span style={{ marginLeft: 8, fontSize: 12, padding: '2px 6px', borderRadius: 999, border: '1px solid var(--im-border)', color: 'var(--im-danger)' }}>
                                  suspicious
                                </span>
                              ) : null}
                            </div>
                            {a.details && (
                              <div className="text-sm" style={{ color: 'var(--im-text-weak)' }}>
                                {a.details}
                              </div>
                            )}
                            <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>
                              {a.ip_address ? `IP: ${a.ip_address} • ` : ''}{formatDateTime(a.timestamp)}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Charts (for export snapshot) */}
          <div
            ref={chartsRef}
            className="rounded-lg p-6 shadow-md"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
            <DateFilter
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              onRefresh={fetchUser}
            />

            <DashboardCharts
              alertPoints={alertPoints}
              pieData={{ labels: pieLabels, values: pieCounts }}
              barData={{ labels: barLabels, values: barMode === 'score' ? barScores : barCounts }}
              barMode={barMode}
              setBarMode={setBarMode}
              topThreatUsers={[]}
              showTopUsers={false}
              groupBy={groupBy}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default UserDetailsPage;
