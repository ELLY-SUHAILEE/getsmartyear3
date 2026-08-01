/**
 * SEQS - Smart English Quiz System
 * Teacher Dashboard - Production JavaScript (dashboard.js)
 * Strictly aligned with existing HTML structure and IDs
 */

(function () {
    'use strict';

    // ==========================================
    // CONFIGURATION & GLOBAL STATE
    // ==========================================
    const CONFIG = {
        APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxE1VmbtwtVKSlNuBMTQJnbMxZIYQXoz0C2fMePYBgCv5srU6VWrsgJyrl2RHOIrnMh/exec',
        REFRESH_INTERVAL_MS: 60000,
        ITEMS_PER_PAGE: 10
    };

    let rawQuizData = [];
    let filteredQuizData = [];
    let chartInstances = {};
    let autoRefreshTimer = null;

    // Table Pagination & Sorting State
    let currentPage = 1;
    let sortColumn = 'date';
    let sortDirection = 'desc';

    // ==========================================
    // INITIALIZATION & EVENT LISTENERS
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        initSessionCheck();
        initTheme();
        initSidebarToggle();
        initEventListeners();

        // Initial Data Fetch & Start Auto-Refresh
        fetchDashboardData();
        startAutoRefresh();
    });

    function initSessionCheck() {
        const currentUser = sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser');
        if (!currentUser && !window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            setCheckState('themeToggle', true);
        }

        bindEvent('themeToggle', 'change', (e) => {
            const isDark = e.target.checked;
            document.body.classList.toggle('dark-theme', isDark);
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            rebuildCharts();
        });
    }

    function initSidebarToggle() {
        bindEvent('sidebarToggle', 'click', () => {
            const sidebar = document.querySelector('.sidebar');
            const mainContent = document.querySelector('.main-content');
            if (sidebar) sidebar.classList.toggle('collapsed');
            if (mainContent) mainContent.classList.toggle('expanded');
        });

        bindEvent('mobileSidebarToggle', 'click', () => {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.classList.toggle('mobile-open');
        });
    }

    function initEventListeners() {
        // Search and Filters
        bindEvent('tableSearch', 'input', handleFilterChange);
        bindEvent('classFilter', 'change', handleFilterChange);
        bindEvent('moduleFilter', 'change', handleFilterChange);
        bindEvent('scoreFilter', 'change', handleFilterChange);
        bindEvent('dateFilter', 'change', handleFilterChange);

        // Reset Filters Button
        bindEvent('resetFiltersBtn', 'click', () => {
            setValue('tableSearch', '');
            setValue('classFilter', 'all');
            setValue('moduleFilter', 'all');
            setValue('scoreFilter', 'all');
            setValue('dateFilter', 'all');
            handleFilterChange();
        });

        // Refresh Data Button
        bindEvent('refreshBtn', 'click', () => {
            fetchDashboardData();
        });

        // Export CSV & Print Report
        bindEvent('exportCsvBtn', 'click', exportToCSV);
        bindEvent('printReportBtn', 'click', () => window.print());

        // Intervention Generator
        bindEvent('generateInterventionsBtn', 'click', renderInterventions);

        // Dynamic Table Header Sorting
        const tableHeader = document.querySelector('.data-table thead, table thead');
        if (tableHeader) {
            tableHeader.addEventListener('click', (e) => {
                const th = e.target.closest('th');
                if (!th) return;

                // Infer sorting column safely based on column header index or dataset
                const thIndex = Array.from(th.parentNode.children).indexOf(th);
                const colMap = ['name', 'class', 'module', 'score', 'percentage', 'date', 'time'];
                const col = th.dataset.sort || colMap[thIndex] || 'date';

                if (sortColumn === col) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = col;
                    sortDirection = 'asc';
                }
                applySorting();
                renderTable();
            });
        }
    }

    function startAutoRefresh() {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(() => {
            fetchDashboardData(true);
        }, CONFIG.REFRESH_INTERVAL_MS);
    }

    // ==========================================
    // DATA FETCHING & PARSING
    // ==========================================
    async function fetchDashboardData(isBackground = false) {
        if (!isBackground) showLoader(true);

        try {
            const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'GET',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const rawJson = await response.json();

            let list = [];
            if (Array.isArray(rawJson)) {
                list = rawJson;
            } else if (rawJson && Array.isArray(rawJson.data)) {
                list = rawJson.data;
            } else {
                throw new Error("Invalid data format received from Google Apps Script.");
            }

            rawQuizData = parseAndCleanData(list);

            populateFilterOptions(rawQuizData);
            handleFilterChange();
            updateLastUpdatedTime();

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            showErrorState(error.message);
        } finally {
            if (!isBackground) showLoader(false);
        }
    }

    function parseAndCleanData(rawArray) {
        return rawArray.map((item, index) => {
            // Convert score "18/20" -> numeric score = 18
            let numericScore = 0;
            let maxScore = 0;
            const scoreStr = String(item.score || '').trim();
            if (scoreStr.includes('/')) {
                const parts = scoreStr.split('/');
                numericScore = parseFloat(parts[0]) || 0;
                maxScore = parseFloat(parts[1]) || 0;
            } else {
                numericScore = parseFloat(scoreStr) || 0;
            }

            // Convert percentage "90%" -> numeric percentage = 90
            let numericPercentage = 0;
            const pctStr = String(item.percentage || '').trim();
            if (pctStr.includes('%')) {
                numericPercentage = parseFloat(pctStr.replace('%', '')) || 0;
            } else {
                numericPercentage = parseFloat(pctStr) || 0;
                if (!numericPercentage && maxScore > 0) {
                    numericPercentage = (numericScore / maxScore) * 100;
                }
            }

            const dateStr = String(item.date || '').trim();
            const timeStr = String(item.time || '').trim();
            const fullDateObj = parseDateTime(dateStr, timeStr);

            return {
                id: item.id || `REC-${index + 1}`,
                name: String(item.name || 'Unknown Student').trim(),
                class: String(item.class || 'Unassigned').trim(),
                module: String(item.module || 'General').trim(),
                scoreRaw: scoreStr || `${numericScore}`,
                score: numericScore,
                maxScore: maxScore,
                percentage: Number(numericPercentage.toFixed(2)),
                date: dateStr,
                time: timeStr,
                dateTimeObj: fullDateObj
            };
        });
    }

    function parseDateTime(dateStr, timeStr) {
        if (!dateStr) return new Date(0);
        let day, month, year;
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            year = parseInt(parts[2], 10);
        } else if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            day = parseInt(parts[2], 10);
        } else {
            return new Date(dateStr);
        }

        let hours = 0, minutes = 0;
        if (timeStr) {
            const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (match) {
                hours = parseInt(match[1], 10);
                minutes = parseInt(match[2], 10);
                const ampm = match[3];
                if (ampm) {
                    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
                    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
                }
            }
        }

        return new Date(year, month, day, hours, minutes);
    }

    // ==========================================
    // METRICS & KPI CALCULATIONS
    // ==========================================
    function calculateAndRenderKPIs(data) {
        if (!data || data.length === 0) {
            setKPIValues({
                totalStudents: 0,
                uniqueStudents: 0,
                totalAttempts: 0,
                avgPercentage: '0%',
                highestScore: 0,
                lowestScore: 0,
                highestClass: '-',
                lowestClass: '-',
                highestModule: '-',
                lowestModule: '-'
            });
            return;
        }

        const totalAttempts = data.length;
        const uniqueStudentsSet = new Set(data.map(d => d.name.toLowerCase()));
        const uniqueStudents = uniqueStudentsSet.size;

        const percentages = data.map(d => d.percentage);
        const scores = data.map(d => d.score);

        const avgPct = percentages.reduce((acc, val) => acc + val, 0) / totalAttempts;
        const highestScore = Math.max(...scores);
        const lowestScore = Math.min(...scores);

        const classStats = aggregatePerformance(data, 'class');
        const sortedClasses = Object.entries(classStats).sort((a, b) => b[1].avg - a[1].avg);
        const highestClass = sortedClasses.length > 0 ? sortedClasses[0][0] : '-';
        const lowestClass = sortedClasses.length > 0 ? sortedClasses[sortedClasses.length - 1][0] : '-';

        const moduleStats = aggregatePerformance(data, 'module');
        const sortedModules = Object.entries(moduleStats).sort((a, b) => b[1].avg - a[1].avg);
        const highestModule = sortedModules.length > 0 ? sortedModules[0][0] : '-';
        const lowestModule = sortedModules.length > 0 ? sortedModules[sortedModules.length - 1][0] : '-';

        setKPIValues({
            totalStudents: uniqueStudents,
            uniqueStudents: uniqueStudents,
            totalAttempts: totalAttempts,
            avgPercentage: `${avgPct.toFixed(1)}%`,
            highestScore: highestScore,
            lowestScore: lowestScore,
            highestClass: highestClass,
            lowestClass: lowestClass,
            highestModule: highestModule,
            lowestModule: lowestModule
        });
    }

    function aggregatePerformance(data, key) {
        const map = {};
        data.forEach(item => {
            const k = item[key];
            if (!map[k]) {
                map[k] = { sumPct: 0, count: 0 };
            }
            map[k].sumPct += item.percentage;
            map[k].count += 1;
        });

        const result = {};
        Object.keys(map).forEach(k => {
            result[k] = {
                avg: map[k].sumPct / map[k].count,
                count: map[k].count
            };
        });
        return result;
    }

    function setKPIValues(kpis) {
        setText('totalStudents', kpis.totalStudents);
        setText('uniqueStudents', kpis.uniqueStudents);
        setText('totalAttempts', kpis.totalAttempts);
        setText('averagePercentage', kpis.avgPercentage);
        setText('avgPercentage', kpis.avgPercentage);
        setText('highestScore', kpis.highestScore);
        setText('lowestScore', kpis.lowestScore);
        setText('highestClass', kpis.highestClass);
        setText('lowestClass', kpis.lowestClass);
        setText('highestModule', kpis.highestModule);
        setText('lowestModule', kpis.lowestModule);
    }

    // ==========================================
    // FILTERING, SEARCHING & SORTING
    // ==========================================
    function populateFilterOptions(data) {
        const classSelect = document.getElementById('classFilter');
        const moduleSelect = document.getElementById('moduleFilter');

        if (classSelect) {
            const currentClass = classSelect.value;
            const classes = Array.from(new Set(data.map(d => d.class))).sort();
            classSelect.innerHTML = '<option value="all">All Classes</option>';
            classes.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                classSelect.appendChild(opt);
            });
            if (classes.includes(currentClass)) classSelect.value = currentClass;
        }

        if (moduleSelect) {
            const currentModule = moduleSelect.value;
            const modules = Array.from(new Set(data.map(d => d.module))).sort();
            moduleSelect.innerHTML = '<option value="all">All Modules</option>';
            modules.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                moduleSelect.appendChild(opt);
            });
            if (modules.includes(currentModule)) moduleSelect.value = currentModule;
        }
    }

    function handleFilterChange() {
        const search = (getValue('tableSearch') || '').toLowerCase().trim();
        const classVal = getValue('classFilter') || 'all';
        const moduleVal = getValue('moduleFilter') || 'all';
        const scoreVal = getValue('scoreFilter') || 'all';
        const dateVal = getValue('dateFilter') || 'all';

        filteredQuizData = rawQuizData.filter(item => {
            const matchSearch = !search ||
                item.name.toLowerCase().includes(search) ||
                item.class.toLowerCase().includes(search) ||
                item.module.toLowerCase().includes(search);

            const matchClass = classVal === 'all' || item.class === classVal;
            const matchModule = moduleVal === 'all' || item.module === moduleVal;

            let matchScore = true;
            if (scoreVal === 'high') matchScore = item.percentage >= 80;
            else if (scoreVal === 'medium') matchScore = item.percentage >= 50 && item.percentage < 80;
            else if (scoreVal === 'low') matchScore = item.percentage < 50;

            let matchDate = true;
            if (dateVal !== 'all') {
                const now = new Date();
                const itemDate = item.dateTimeObj;
                const diffDays = (now - itemDate) / (1000 * 60 * 60 * 24);
                if (dateVal === 'today') matchDate = diffDays <= 1;
                else if (dateVal === 'week') matchDate = diffDays <= 7;
                else if (dateVal === 'month') matchDate = diffDays <= 30;
            }

            return matchSearch && matchClass && matchModule && matchScore && matchDate;
        });

        currentPage = 1;
        applySorting();

        calculateAndRenderKPIs(filteredQuizData);
        renderTable();
        rebuildCharts();
        renderTopStudents();
        renderAiInsights();
        renderReports();
    }

    function applySorting() {
        filteredQuizData.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];

            if (sortColumn === 'date') {
                valA = a.dateTimeObj.getTime();
                valB = b.dateTimeObj.getTime();
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // ==========================================
    // TABLE & PAGINATION RENDERING
    // ==========================================
    function renderTable() {
        const tbody = document.querySelector('table tbody, .data-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (filteredQuizData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #6b7280;">
                        No records found matching the criteria.
                    </td>
                </tr>`;
            renderPagination(0);
            return;
        }

        const totalPages = Math.ceil(filteredQuizData.length / CONFIG.ITEMS_PER_PAGE);
        currentPage = Math.min(Math.max(1, currentPage), totalPages);

        const startIndex = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
        const pageData = filteredQuizData.slice(startIndex, startIndex + CONFIG.ITEMS_PER_PAGE);

        pageData.forEach(item => {
            const tr = document.createElement('tr');

            let badgeClass = 'badge-success';
            if (item.percentage < 50) badgeClass = 'badge-danger';
            else if (item.percentage < 75) badgeClass = 'badge-warning';

            tr.innerHTML = `
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(item.class)}</td>
                <td>${escapeHtml(item.module)}</td>
                <td>${escapeHtml(item.scoreRaw)}</td>
                <td><span class="badge ${badgeClass}">${item.percentage}%</span></td>
                <td>${escapeHtml(item.date)}</td>
                <td>${escapeHtml(item.time || '-')}</td>
            `;
            tbody.appendChild(tr);
        });

        renderPagination(totalPages);
    }

    function renderPagination(totalPages) {
        const container = document.getElementById('paginationControls') || document.getElementById('pagination');
        if (!container) return;

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = `<button class="btn btn-sm" ${currentPage === 1 ? 'disabled' : ''} id="btnPrevPage">&laquo; Prev</button>`;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : ''}" data-page="${i}">${i}</button>`;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += `<span style="padding: 0 4px;">...</span>`;
            }
        }

        html += `<button class="btn btn-sm" ${currentPage === totalPages ? 'disabled' : ''} id="btnNextPage">Next &raquo;</button>`;
        container.innerHTML = html;

        bindEvent('btnPrevPage', 'click', () => {
            if (currentPage > 1) { currentPage--; renderTable(); }
        });
        bindEvent('btnNextPage', 'click', () => {
            if (currentPage < totalPages) { currentPage++; renderTable(); }
        });

        container.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentPage = parseInt(e.target.dataset.page, 10);
                renderTable();
            });
        });
    }

    // ==========================================
    // CHARTS (CHART.JS)
    // ==========================================
    function rebuildCharts() {
        if (typeof Chart === 'undefined') return;

        renderClassPerformanceChart();
        renderModuleMasteryChart();
        renderScoreDistributionChart();
        renderPerformanceTrendChart();
    }

    function createOrUpdateChart(canvasId, config) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }

        chartInstances[canvasId] = new Chart(canvas.getContext('2d'), config);
    }

    function renderClassPerformanceChart() {
        const aggregated = aggregatePerformance(filteredQuizData, 'class');
        const labels = Object.keys(aggregated);
        const dataValues = labels.map(l => Number(aggregated[l].avg.toFixed(1)));

        createOrUpdateChart('classPerformanceChart', {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Score (%)',
                    data: dataValues,
                    backgroundColor: 'rgba(79, 70, 229, 0.75)',
                    borderColor: '#4f46e5',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    function renderModuleMasteryChart() {
        const aggregated = aggregatePerformance(filteredQuizData, 'module');
        const labels = Object.keys(aggregated);
        const dataValues = labels.map(l => Number(aggregated[l].avg.toFixed(1)));

        createOrUpdateChart('moduleMasteryChart', {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Module Mastery (%)',
                    data: dataValues,
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderColor: '#10b981',
                    pointBackgroundColor: '#10b981'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    function renderScoreDistributionChart() {
        let excellent = 0, good = 0, average = 0, needsImprovement = 0;

        filteredQuizData.forEach(item => {
            if (item.percentage >= 85) excellent++;
            else if (item.percentage >= 70) good++;
            else if (item.percentage >= 50) average++;
            else needsImprovement++;
        });

        createOrUpdateChart('scoreDistributionChart', {
            type: 'doughnut',
            data: {
                labels: ['Excellent (85-100%)', 'Good (70-84%)', 'Average (50-69%)', 'Needs Help (<50%)'],
                datasets: [{
                    data: [excellent, good, average, needsImprovement],
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    function renderPerformanceTrendChart() {
        const sorted = [...filteredQuizData].sort((a, b) => a.dateTimeObj - b.dateTimeObj);

        const dateMap = {};
        sorted.forEach(item => {
            const dateStr = item.date || 'Unknown';
            if (!dateMap[dateStr]) {
                dateMap[dateStr] = { sum: 0, count: 0 };
            }
            dateMap[dateStr].sum += item.percentage;
            dateMap[dateStr].count += 1;
        });

        const labels = Object.keys(dateMap);
        const averages = labels.map(d => Number((dateMap[d].sum / dateMap[d].count).toFixed(1)));

        createOrUpdateChart('performanceTrendChart', {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Average (%)',
                    data: averages,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    // ==========================================
    // TOP STUDENTS & DYNAMIC SECTIONS
    // ==========================================
    function renderTopStudents() {
        const container = document.getElementById('topStudentsList') || document.getElementById('topStudentsContainer');
        if (!container) return;

        container.innerHTML = '';

        if (filteredQuizData.length === 0) {
            container.innerHTML = '<p style="color: gray; padding: 0.5rem;">No student records available.</p>';
            return;
        }

        const studentMap = {};
        filteredQuizData.forEach(item => {
            const key = item.name;
            if (!studentMap[key] || item.percentage > studentMap[key].percentage) {
                studentMap[key] = item;
            }
        });

        const sortedTop = Object.values(studentMap)
            .sort((a, b) => b.percentage - a.percentage)
            .slice(0, 5);

        sortedTop.forEach((student, index) => {
            const div = document.createElement('div');
            div.className = 'top-student-card';
            div.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid rgba(0,0,0,0.08);';
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-weight: bold; width: 24px; text-align: center; color: #4f46e5;">#${index + 1}</span>
                    <div>
                        <div style="font-weight: 600;">${escapeHtml(student.name)}</div>
                        <div style="font-size: 0.8rem; color: gray;">${escapeHtml(student.class)} • ${escapeHtml(student.module)}</div>
                    </div>
                </div>
                <div>
                    <span class="badge badge-success">${student.percentage}%</span>
                </div>
            `;
            container.appendChild(div);
        });
    }

    function renderAiInsights() {
        const container = document.getElementById('aiInsightsContainer') || document.getElementById('aiInsights');
        if (!container) return;

        if (filteredQuizData.length === 0) {
            container.innerHTML = '<p>No data available to generate insights.</p>';
            return;
        }

        const avgPct = filteredQuizData.reduce((acc, i) => acc + i.percentage, 0) / filteredQuizData.length;
        const lowPerformers = filteredQuizData.filter(i => i.percentage < 50);
        const highPerformers = filteredQuizData.filter(i => i.percentage >= 85);

        const classStats = aggregatePerformance(filteredQuizData, 'class');
        const weakestClass = Object.entries(classStats).sort((a, b) => a[1].avg - b[1].avg)[0];

        const moduleStats = aggregatePerformance(filteredQuizData, 'module');
        const weakestModule = Object.entries(moduleStats).sort((a, b) => a[1].avg - b[1].avg)[0];

        container.innerHTML = `
            <ul style="list-style-type: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem;">
                <li style="padding: 0.5rem; border-left: 4px solid #3b82f6; background: rgba(59,130,246,0.05);">
                    <strong>Overall Standing:</strong> Cohort average is <strong>${avgPct.toFixed(1)}%</strong> across current records.
                </li>
                ${weakestModule ? `
                <li style="padding: 0.5rem; border-left: 4px solid #f59e0b; background: rgba(245,158,11,0.05);">
                    <strong>Module Attention:</strong> <strong>${escapeHtml(weakestModule[0])}</strong> shows lower relative performance (${weakestModule[1].avg.toFixed(1)}%).
                </li>` : ''}
                ${weakestClass ? `
                <li style="padding: 0.5rem; border-left: 4px solid #ef4444; background: rgba(239,68,68,0.05);">
                    <strong>Class Focus:</strong> <strong>${escapeHtml(weakestClass[0])}</strong> requires additional practice sessions.
                </li>` : ''}
                <li style="padding: 0.5rem; border-left: 4px solid #10b981; background: rgba(16,185,129,0.05);">
                    <strong>Distribution:</strong> ${highPerformers.length} attempt(s) reached Excellence while ${lowPerformers.length} attempt(s) require intervention.
                </li>
            </ul>
        `;
    }

    function renderReports() {
        const container = document.getElementById('reportsSummaryContainer') || document.getElementById('reportsSummary');
        if (!container) return;

        const total = filteredQuizData.length;
        if (total === 0) {
            container.innerHTML = '<p>No data to summarize in report.</p>';
            return;
        }

        const passCount = filteredQuizData.filter(i => i.percentage >= 50).length;
        const passRate = ((passCount / total) * 100).toFixed(1);

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
                <div style="padding: 1rem; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;">
                    <div style="font-size: 0.85rem; color: gray;">Pass Rate</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${passRate}%</div>
                </div>
                <div style="padding: 1rem; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;">
                    <div style="font-size: 0.85rem; color: gray;">Total Attempts Evaluated</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">${total}</div>
                </div>
            </div>
        `;
    }

    function renderInterventions() {
        const container = document.getElementById('interventionsContainer') || document.getElementById('interventions');
        if (!container) return;

        const struggling = filteredQuizData.filter(i => i.percentage < 50);

        if (struggling.length === 0) {
            container.innerHTML = `
                <div style="padding: 1rem; background: rgba(16,185,129,0.1); border-radius: 6px; color: #065f46;">
                    ✔ No immediate interventions needed! All filtered students are performing above 50%.
                </div>`;
            return;
        }

        const studentList = Array.from(new Set(struggling.map(s => `${s.name} (${s.class} - ${s.module}: ${s.percentage}%)`)));

        container.innerHTML = `
            <div style="padding: 1rem; border: 1px solid #fca5a5; background: #fff5f5; border-radius: 6px;">
                <h4 style="margin-top:0; color: #991b1b;">Recommended Targeted Actions (${studentList.length} Students)</h4>
                <ul style="margin-bottom: 0; padding-left: 1.25rem;">
                    ${studentList.map(item => `<li style="margin-bottom: 0.25rem;"><strong>${escapeHtml(item)}</strong></li>`).join('')}
                </ul>
                <p style="margin-top: 0.75rem; font-size: 0.85rem; color: #7f1d1d;">
                    <em>Suggested Action: Assign supplementary modules and guided practice sessions.</em>
                </p>
            </div>
        `;
    }

    // ==========================================
    // CSV EXPORT UTILITY
    // ==========================================
    function exportToCSV() {
        if (!filteredQuizData || filteredQuizData.length === 0) {
            alert('No data available to export.');
            return;
        }

        const headers = ['Student ID', 'Student Name', 'Class', 'Module', 'Score', 'Percentage', 'Date', 'Time'];
        const rows = filteredQuizData.map(item => [
            escapeCsvCell(item.id),
            escapeCsvCell(item.name),
            escapeCsvCell(item.class),
            escapeCsvCell(item.module),
            escapeCsvCell(item.scoreRaw),
            escapeCsvCell(`${item.percentage}%`),
            escapeCsvCell(item.date),
            escapeCsvCell(item.time)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\r\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `SEQS_Quiz_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function escapeCsvCell(str) {
        if (str === null || str === undefined) return '""';
        const stringified = String(str).replace(/"/g, '""');
        return `"${stringified}"`;
    }

    // ==========================================
    // UI HELPERS & DOM UTILITIES
    // ==========================================
    function updateLastUpdatedTime() {
        const el = document.getElementById('lastUpdatedTime') || document.getElementById('lastUpdated');
        if (el) {
            const now = new Date();
            el.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        }
    }

    function showLoader(visible) {
        const loader = document.getElementById('loader') || document.getElementById('loadingSpinner');
        if (loader) {
            loader.style.display = visible ? 'flex' : 'none';
        }
    }

    function showErrorState(msg) {
        const tbody = document.querySelector('table tbody, .data-table tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">
                        ⚠️ Failed to load live data: ${escapeHtml(msg)}
                    </td>
                </tr>`;
        }
    }

    function bindEvent(id, event, handler) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
        }
    }

    function getValue(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function setValue(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setCheckState(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = checked;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

})();