// Game state
const state = {
    currentScenario: 1,
    unlockedScenarios: 1,

    // Base parameters
    hurdleRate: 12,
    baseReturn: 18, // Target IRR for the project with no delay
    projectValue: 100, // $100M project for illustration

    // Project structure (renewable energy style)
    capex: 100, // $100M upfront
    opexRate: 4, // $4M per year operating costs (fixed)
    projectLife: 25, // 25 year project life
    constructionTime: 1, // 1 year to build after permits

    // Scenario-specific
    knownDelay: 1,
    shortDelay: 1,
    longDelay: 3,
    shortDelayProb: 50,
    restartProb: 10
};

// Chart instance
let dcfChart = null;

// Calculate annual revenue needed to achieve target IRR with no delay
// Uses numerical solver to match exact cash flow structure
// Baseline (no delay): CAPEX at year 0, operations start year 1
function getAnnualRevenue() {
    const targetIRR = state.baseReturn / 100;

    // Binary search for the net cash flow that gives target IRR
    let low = 0;
    let high = state.capex * 2; // Upper bound
    let netCF = (low + high) / 2;

    for (let iter = 0; iter < 50; iter++) {
        // Build cash flows with current guess (no delay scenario)
        // Year 0: CAPEX deployed
        // Years 1 to projectLife: Operations
        const cashFlows = [-state.capex]; // Year 0: CAPEX
        for (let y = 1; y <= state.projectLife; y++) {
            cashFlows.push(netCF); // Years 1 to projectLife: operations
        }

        // Calculate IRR of these cash flows
        const irr = calculateIRRFromFlows(cashFlows);

        if (Math.abs(irr - targetIRR) < 0.0001) {
            break;
        }

        if (irr < targetIRR) {
            low = netCF; // Need higher cash flows
        } else {
            high = netCF; // Need lower cash flows
        }
        netCF = (low + high) / 2;
    }

    return netCF + state.opexRate;
}

// IRR calculation helper - takes array of cash flows
function calculateIRRFromFlows(cashFlows) {
    let guess = 0.1;
    const maxIterations = 100;
    const tolerance = 0.00001;

    for (let i = 0; i < maxIterations; i++) {
        let npv = 0;
        let dnpv = 0;

        for (let t = 0; t < cashFlows.length; t++) {
            const factor = Math.pow(1 + guess, -t);
            npv += cashFlows[t] * factor;
            dnpv -= t * cashFlows[t] * Math.pow(1 + guess, -t - 1);
        }

        if (Math.abs(dnpv) < 1e-10) break;

        const newGuess = guess - npv / dnpv;

        if (Math.abs(newGuess - guess) < tolerance) {
            return newGuess;
        }

        // Clamp to avoid divergence
        guess = Math.max(-0.99, Math.min(newGuess, 10));
    }

    return guess;
}

// Scenario definitions
const scenarios = {
    1: {
        title: "Scenario 1: The Baseline",
        description: "A simple world: Your company wants to build an energy project and has to evaluate it against a hurdle rate. If expected returns exceed the hurdle, you invest. No delays, no uncertainty.",
        insight: "This is the textbook case. Projects that clear the hurdle get built. In reality, this scenario almost never exists.",
        pipeline: [
            { name: "Project Conception", icon: "💡", status: "complete" },
            { name: "Investment Decision", icon: "💰", status: "active" },
            { name: "Construction", icon: "🏗️", status: "pending" },
            { name: "Returns", icon: "📈", status: "pending" }
        ]
    },
    2: {
        title: "Scenario 2: The Known Delay",
        description: "In reality, building anything will require a permit.You've already committed capital—land options, engineering, equipment deposits—so the clock is ticking from day one. But in this scenario, we know how long a permit will take. ",
        insight: "With capital deployed at t=0, delays are devastating. Your money is tied up earning nothing while you wait. A 3-year delay doesn't just push returns back—it means 3 years of zero return on committed capital. Watch both NPV and IRR drop as you increase the delay.",
        pipeline: [
            { name: "Project Conception", icon: "💡", status: "complete" },
            { name: "Permitting Queue", icon: "📋", status: "delayed", detail: "Waiting..." },
            { name: "Investment Decision", icon: "💰", status: "active" },
            { name: "Construction", icon: "🏗️", status: "pending" },
            { name: "Returns", icon: "📈", status: "pending" }
        ]
    },
    3: {
        title: "Scenario 3: The Uncertain Delay",
        description: "Worse than waiting is not knowing how long you'll wait. Your project faces either a short delay or a long one—you won't know until you're deep in the process.",
        insight: "Here's the key insight: a 50/50 chance between 1 and 3 years is WORSE than a certain 2-year delay, even though the expected wait is the same. Variance destroys value because the bad outcome hurts more than the good outcome helps (convexity of discounting).",
        pipeline: [
            { name: "Project Conception", icon: "💡", status: "complete" },
            { name: "Permitting", icon: "📋", status: "delayed", detail: "Duration unknown" },
            { name: "Investment Decision", icon: "💰", status: "active" },
            { name: "Construction", icon: "🏗️", status: "pending" },
            { name: "Returns", icon: "📈", status: "pending" }
        ]
    },
    4: {
        title: "Scenario 4: The Recursive Nightmare",
        description: "Even after you get approval, there's a chance you'll be sent back to the beginning. A lawsuit, a new regulation, a change in administration—suddenly you're re-permitting.",
        insight: "Recursive risk is devastating because it's multiplicative. A 10% restart chance doesn't reduce returns by 10%—it creates a probability-weighted cascade of increasingly delayed scenarios. This is why developers price in massive risk premiums for jurisdictions with litigation exposure.",
        pipeline: [
            { name: "Project Conception", icon: "💡", status: "complete" },
            { name: "Permitting", icon: "📋", status: "delayed", detail: "Duration unknown" },
            { name: "Approval", icon: "✓", status: "pending", detail: "May be challenged" },
            { name: "Investment Decision", icon: "💰", status: "active" },
            { name: "Construction", icon: "🏗️", status: "pending" },
            { name: "Returns", icon: "📈", status: "pending" }
        ]
    }
};

// Rendering functions
function renderPipeline() {
    const pipeline = document.getElementById('pipeline');
    const stages = scenarios[state.currentScenario].pipeline;

    pipeline.innerHTML = stages.map(stage => `
        <div class="pipeline-stage ${stage.status}">
            <div class="stage-icon">${stage.icon}</div>
            <div class="stage-info">
                <div class="stage-name">${stage.name}</div>
                ${stage.detail ? `<div class="stage-detail">${stage.detail}</div>` : ''}
            </div>
            ${stage.probability ? `<div class="stage-probability">${stage.probability}</div>` : ''}
        </div>
    `).join('');
}

function renderScenarioInfo() {
    const info = document.getElementById('scenarioInfo');
    const scenario = scenarios[state.currentScenario];

    info.innerHTML = `
        <div class="scenario-title">${scenario.title}</div>
        <div class="scenario-desc">${scenario.description}</div>
    `;
}

function renderControls() {
    const controls = document.getElementById('controls');
    let html = '';

    // Base controls always shown
    html += `
        <div class="control-group">
            <label class="control-label">Hurdle Rate (Required Return)</label>
            <div class="control-value">${state.hurdleRate}%</div>
            <input type="range" id="hurdleRate" min="5" max="25" step="0.5" value="${state.hurdleRate}">
            <div class="slider-labels"><span>5%</span><span>25%</span></div>
        </div>
        <div class="control-group">
            <label class="control-label">Project Base Return</label>
            <div class="control-value">${state.baseReturn}%</div>
            <input type="range" id="baseReturn" min="5" max="30" step="0.5" value="${state.baseReturn}">
            <div class="slider-labels"><span>5%</span><span>30%</span></div>
        </div>
    `;

    // Scenario-specific controls
    if (state.currentScenario >= 2) {
        if (state.currentScenario === 2) {
            html += `
                <div class="control-group">
                    <label class="control-label">Permitting Delay (Years)</label>
                    <div class="control-value">${state.knownDelay.toFixed(1)} year${state.knownDelay !== 1 ? 's' : ''}</div>
                    <input type="range" id="knownDelay" min="0" max="7" step="0.5" value="${state.knownDelay}">
                    <div class="slider-labels"><span>0</span><span>7</span></div>
                </div>
            `;
        }
    }

    if (state.currentScenario >= 3) {
        html += `
            <div class="control-group">
                <label class="control-label">Short Delay (Years)</label>
                <div class="control-value">${state.shortDelay.toFixed(1)} year${state.shortDelay !== 1 ? 's' : ''}</div>
                <input type="range" id="shortDelay" min="0" max="5" step="0.5" value="${state.shortDelay}">
                <div class="slider-labels"><span>0</span><span>5</span></div>
            </div>
            <div class="control-group">
                <label class="control-label">Long Delay (Years)</label>
                <div class="control-value">${state.longDelay.toFixed(1)} year${state.longDelay !== 1 ? 's' : ''}</div>
                <input type="range" id="longDelay" min="${state.shortDelay}" max="10" step="0.5" value="${state.longDelay}">
                <div class="slider-labels"><span>${state.shortDelay.toFixed(1)}</span><span>10</span></div>
            </div>
            <div class="control-group">
                <label class="control-label">Probability of Short Delay</label>
                <div class="control-value">${state.shortDelayProb}%</div>
                <input type="range" id="shortDelayProb" min="0" max="100" step="5" value="${state.shortDelayProb}">
                <div class="slider-labels"><span>0%</span><span>100%</span></div>
            </div>
            <div class="prob-bar-container">
                <div class="prob-bar">
                    <div class="prob-segment short" style="width: ${state.shortDelayProb}%">${state.shortDelay.toFixed(1)}yr</div>
                    <div class="prob-segment long" style="width: ${100 - state.shortDelayProb}%">${state.longDelay.toFixed(1)}yr</div>
                </div>
                <div class="prob-legend">
                    <div class="legend-item"><div class="legend-dot" style="background: var(--accent-green)"></div> Short delay</div>
                    <div class="legend-item"><div class="legend-dot" style="background: var(--accent-yellow)"></div> Long delay</div>
                </div>
            </div>
        `;
    }

    if (state.currentScenario >= 4) {
        html += `
            <div class="control-group">
                <label class="control-label">Restart Probability (After Approval)</label>
                <div class="control-value">${state.restartProb}%</div>
                <input type="range" id="restartProb" min="0" max="50" step="5" value="${state.restartProb}">
                <div class="slider-labels"><span>0%</span><span>50%</span></div>
            </div>
        `;
    }

    controls.innerHTML = html;

    // Add event listeners
    document.querySelectorAll('input[type="range"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            state[e.target.id] = value;

            // Enforce long delay >= short delay
            if (e.target.id === 'shortDelay' && state.longDelay < value) {
                state.longDelay = value;
            }
            if (e.target.id === 'longDelay' && value < state.shortDelay) {
                state.longDelay = state.shortDelay;
            }

            renderControls();
            renderResults();
            renderChart();
        });
    });
}

function renderResults() {
    const cashFlowData = generateCashFlows();
    const irr = cashFlowData.irr;
    const npv = cashFlowData.npv;
    const delay = getExpectedDelay();

    // Calculate baseline NPV (what NPV would be with no delay)
    const baselineNPV = calculateBaselineNPV();
    const npvLost = baselineNPV - npv;

    const willInvest = npv >= 0; // Decision based on NPV at hurdle rate
    const spread = irr - state.hurdleRate;

    // Results panel
    const results = document.getElementById('results');

    let resultsHtml = `
        <div class="result-row">
            <span class="result-label">Hurdle Rate</span>
            <span class="result-value">${state.hurdleRate}%</span>
        </div>
    `;

    if (state.currentScenario === 1) {
        // No delay scenario
        resultsHtml += `
            <div class="result-row">
                <span class="result-label">Project IRR</span>
                <span class="result-value highlight ${irr >= state.hurdleRate ? 'positive' : 'negative'}">${irr.toFixed(1)}%</span>
            </div>
            <div class="result-row">
                <span class="result-label">Net Present Value</span>
                <span class="result-value ${npv >= 0 ? 'positive' : 'negative'}">${npv >= 0 ? '+' : ''}$${npv.toFixed(1)}M</span>
            </div>
        `;
    } else {
        // Delay scenarios - show degradation
        resultsHtml += `
            <div class="result-row">
                <span class="result-label">Baseline IRR (No Delay)</span>
                <span class="result-value">${state.baseReturn}%</span>
            </div>
            <div class="result-row">
                <span class="result-label">Actual IRR</span>
                <span class="result-value highlight ${irr >= state.hurdleRate ? 'positive' : 'negative'}">${irr.toFixed(1)}%</span>
            </div>
            <div class="result-row">
                <span class="result-label">IRR Destroyed by Delay</span>
                <span class="result-value negative">-${(state.baseReturn - irr).toFixed(1)}%</span>
            </div>
            <div class="result-row">
                <span class="result-label">Baseline NPV (No Delay)</span>
                <span class="result-value">$${baselineNPV.toFixed(1)}M</span>
            </div>
            <div class="result-row">
                <span class="result-label">Actual NPV</span>
                <span class="result-value ${npv >= 0 ? 'positive' : 'negative'}">${npv >= 0 ? '+' : ''}$${npv.toFixed(1)}M</span>
            </div>
            <div class="result-row">
                <span class="result-label">Value Destroyed by Delay</span>
                <span class="result-value negative">-$${npvLost.toFixed(1)}M</span>
            </div>
        `;
    }

    results.innerHTML = resultsHtml;

    // Decision box
    const decisionBox = document.getElementById('decisionBox');
    const decisionText = document.getElementById('decisionText');
    const decisionReason = document.getElementById('decisionReason');

    decisionBox.className = `decision-box ${willInvest ? 'invest' : 'reject'}`;
    decisionText.textContent = willInvest ? 'INVEST' : 'REJECT';
    decisionReason.textContent = willInvest
        ? `NPV of $${npv.toFixed(1)}M is positive at ${state.hurdleRate}% hurdle`
        : `NPV of $${npv.toFixed(1)}M is negative at ${state.hurdleRate}% hurdle`;

    // Math breakdown
    const mathBreakdown = document.getElementById('mathBreakdown');

    let breakdownHtml = `
        <div class="math-line">
            <span>CAPEX (deployed at t=0)</span>
            <span>$${state.capex}M</span>
        </div>
        <div class="math-line">
            <span>Annual Revenue</span>
            <span>$${cashFlowData.annualRevenue.toFixed(1)}M/yr</span>
        </div>
        <div class="math-line">
            <span>Annual Opex</span>
            <span>$${state.opexRate}M/yr</span>
        </div>
        <div class="math-line">
            <span>Net Annual Cash Flow</span>
            <span>$${cashFlowData.annualNetCF.toFixed(1)}M/yr</span>
        </div>
        <div class="math-line">
            <span>Operating Life</span>
            <span>${state.projectLife} years</span>
        </div>
    `;

    if (state.currentScenario >= 2) {
        breakdownHtml += `
            <div class="math-line">
                <span>Permitting Delay</span>
                <span>${delay.toFixed(1)} years</span>
            </div>
        `;
    }

    breakdownHtml += `
        <div class="math-line result">
            <span>Project IRR</span>
            <span>${irr.toFixed(1)}%</span>
        </div>
    `;

    mathBreakdown.innerHTML = breakdownHtml;
}

// Calculate NPV for baseline (no delay) case
function calculateBaselineNPV() {
    const annualRevenue = getAnnualRevenue();
    const annualNetCF = annualRevenue - state.opexRate;

    let npv = 0;
    // Year 0: CAPEX
    npv -= state.capex;
    // Years 1 to projectLife: net cash flow
    for (let y = 1; y <= state.projectLife; y++) {
        npv += annualNetCF / Math.pow(1 + state.hurdleRate / 100, y);
    }
    return npv;
}

function renderInsight() {
    const insight = document.getElementById('insight');
    const scenario = scenarios[state.currentScenario];

    insight.innerHTML = `
        <div class="insight-title">💡 Key Insight</div>
        <div class="insight-text">${scenario.insight}</div>
    `;
}

function getExpectedDelay() {
    switch (state.currentScenario) {
        case 1:
            return 0;
        case 2:
            return state.knownDelay;
        case 3:
        case 4:
            const p_short = state.shortDelayProb / 100;
            const p_long = 1 - p_short;
            let expectedSingleDelay = p_short * state.shortDelay + p_long * state.longDelay;

            if (state.currentScenario >= 4) {
                const p_restart = state.restartProb / 100;
                const expectedAttempts = 1 / (1 - p_restart);
                return expectedSingleDelay * expectedAttempts;
            }
            return expectedSingleDelay;
        default:
            return 0;
    }
}

function generateCashFlows() {
    const delay = getExpectedDelay();
    // Timeline:
    // Year 0: CAPEX deployed (always)
    // Years 1 to delay: Waiting for permits (carrying costs if applicable)
    // Years (delay+1) to (delay+projectLife): Operations
    const operationsStart = Math.floor(delay) + 1;
    const operationsEnd = Math.floor(delay) + state.projectLife;

    // Get the annual revenue that corresponds to the target IRR
    const annualRevenue = getAnnualRevenue();
    const annualNetCF = annualRevenue - state.opexRate;

    const years = [];
    const annualCashFlows = [];
    const cumulativeNominal = [];
    const cumulativeDiscounted = [];

    let cumNominal = 0;
    let cumDiscounted = 0;

    // Generate cash flows year by year
    const maxYears = Math.max(operationsEnd + 1, 12);

    for (let year = 0; year <= maxYears; year++) {
        years.push(year);

        let cashFlow = 0;

        // Year 0: CAPEX
        if (year === 0) {
            cashFlow -= state.capex;
        }

        // Operations: Revenue - Opex
        if (year >= operationsStart && year <= operationsEnd) {
            cashFlow += annualNetCF;
        }

        annualCashFlows.push(cashFlow);

        cumNominal += cashFlow;
        cumulativeNominal.push(cumNominal);

        const discountFactor = Math.pow(1 + state.hurdleRate / 100, -year);
        cumDiscounted += cashFlow * discountFactor;
        cumulativeDiscounted.push(cumDiscounted);
    }

    return {
        years,
        annualCashFlows,
        cumulativeNominal,
        cumulativeDiscounted,
        delay,
        operationsStart,
        operationsEnd,
        npv: cumDiscounted,
        paybackNominal: findPayback(years, cumulativeNominal),
        paybackDiscounted: findPayback(years, cumulativeDiscounted),
        irr: calculateIRR(annualCashFlows),
        annualRevenue,
        annualNetCF
    };
}

function findPayback(years, cumulative) {
    for (let i = 0; i < cumulative.length; i++) {
        if (cumulative[i] >= 0) {
            if (i === 0) return 0;
            // Linear interpolation
            const prev = cumulative[i - 1];
            const curr = cumulative[i];
            return years[i - 1] + (-prev) / (curr - prev);
        }
    }
    return null; // Never pays back
}

function calculateIRR(cashFlows) {
    // Newton-Raphson method for IRR
    let guess = 0.1;
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
        let npv = 0;
        let dnpv = 0;

        for (let t = 0; t < cashFlows.length; t++) {
            const factor = Math.pow(1 + guess, -t);
            npv += cashFlows[t] * factor;
            dnpv -= t * cashFlows[t] * Math.pow(1 + guess, -t - 1);
        }

        if (Math.abs(dnpv) < 1e-10) break;

        const newGuess = guess - npv / dnpv;

        if (Math.abs(newGuess - guess) < tolerance) {
            return newGuess * 100;
        }

        guess = newGuess;
    }

    return guess * 100;
}

function renderChart() {
    const ctx = document.getElementById('dcfChart').getContext('2d');
    const data = generateCashFlows();

    // Limit display to first 12 years (0-12 = 13 data points)
    const displayYears = 12;
    const chartYears = data.years.slice(0, displayYears + 1);
    const chartAnnualCF = data.annualCashFlows.slice(0, displayYears + 1);
    const chartCumNominal = data.cumulativeNominal.slice(0, displayYears + 1);
    const chartCumDiscounted = data.cumulativeDiscounted.slice(0, displayYears + 1);

    if (dcfChart) {
        dcfChart.destroy();
    }

    // Create gradient for cumulative line
    const gradientGreen = ctx.createLinearGradient(0, 0, 0, 300);
    gradientGreen.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
    gradientGreen.addColorStop(1, 'rgba(34, 197, 94, 0)');

    dcfChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartYears,
            datasets: [
                {
                    label: 'Annual Cash Flow',
                    data: chartAnnualCF,
                    type: 'bar',
                    backgroundColor: chartAnnualCF.map(v =>
                        v >= 0 ? 'rgba(74, 222, 128, 0.5)' : 'rgba(248, 113, 113, 0.5)'
                    ),
                    borderColor: chartAnnualCF.map(v =>
                        v >= 0 ? 'rgba(74, 222, 128, 1)' : 'rgba(248, 113, 113, 1)'
                    ),
                    borderWidth: 2,
                    order: 2
                },
                {
                    label: 'Cumulative (Nominal)',
                    data: chartCumNominal,
                    type: 'line',
                    borderColor: '#16a34a',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0.1,
                    order: 1
                },
                {
                    label: 'Cumulative (Discounted)',
                    data: chartCumDiscounted,
                    type: 'line',
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0.1,
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#ffffff',
                    borderColor: '#e5e0d8',
                    borderWidth: 2,
                    titleColor: '#2d2a26',
                    bodyColor: '#6b6560',
                    titleFont: {
                        family: 'JetBrains Mono'
                    },
                    bodyFont: {
                        family: 'JetBrains Mono'
                    },
                    callbacks: {
                        title: (items) => `Year ${items[0].label}`,
                        label: (item) => {
                            const value = item.parsed.y;
                            const sign = value >= 0 ? '+' : '';
                            return `${item.dataset.label}: ${sign}$${value.toFixed(1)}M`;
                        }
                    }
                },
                annotation: {
                    annotations: data.delay > 0 ? {
                        delayZone: {
                            type: 'box',
                            xMin: 0,
                            xMax: data.delay,
                            backgroundColor: 'rgba(234, 179, 8, 0.1)',
                            borderColor: 'rgba(234, 179, 8, 0.5)',
                            borderWidth: 1,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: 'Permitting',
                                position: 'start'
                            }
                        }
                    } : {}
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Year',
                        color: '#6b6560',
                        font: {
                            family: 'JetBrains Mono',
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.06)'
                    },
                    ticks: {
                        color: '#6b6560',
                        font: {
                            family: 'JetBrains Mono',
                            size: 10
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Cash Flow ($M)',
                        color: '#6b6560',
                        font: {
                            family: 'JetBrains Mono',
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.06)'
                    },
                    ticks: {
                        color: '#6b6560',
                        font: {
                            family: 'JetBrains Mono',
                            size: 10
                        },
                        callback: (value) => `$${value}M`
                    }
                }
            }
        }
    });

    // Render metrics
    const metrics = document.getElementById('chartMetrics');
    const paybackText = data.paybackDiscounted
        ? `${data.paybackDiscounted.toFixed(1)} yrs`
        : 'Never';
    const npvClass = data.npv >= 0 ? 'positive' : 'negative';
    const irrClass = data.irr >= state.hurdleRate ? 'positive' : 'negative';

    metrics.innerHTML = `
        <div class="chart-metric">
            <div class="chart-metric-value ${npvClass}">$${data.npv.toFixed(1)}M</div>
            <div class="chart-metric-label">Net Present Value</div>
        </div>
        <div class="chart-metric">
            <div class="chart-metric-value ${irrClass}">${data.irr.toFixed(1)}%</div>
            <div class="chart-metric-label">Internal Rate of Return</div>
        </div>
        <div class="chart-metric">
            <div class="chart-metric-value" style="color: var(--accent-yellow);">${data.delay.toFixed(1)} yrs</div>
            <div class="chart-metric-label">Expected Permitting Delay</div>
        </div>
    `;
}

function renderNextButton() {
    const nextBtn = document.getElementById('nextBtn');
    const hasNext = state.currentScenario < Object.keys(scenarios).length;

    if (hasNext) {
        nextBtn.textContent = `Continue to Scenario ${state.currentScenario + 1} →`;
        nextBtn.disabled = false;
    } else {
        nextBtn.textContent = 'All scenarios complete!';
        nextBtn.disabled = true;
    }
}

function renderScenarioNav() {
    const nav = document.getElementById('scenarioNav');
    const buttons = nav.querySelectorAll('.scenario-btn');

    buttons.forEach(btn => {
        const scenario = parseInt(btn.dataset.scenario);
        btn.classList.remove('active', 'locked');

        if (scenario === state.currentScenario) {
            btn.classList.add('active');
        } else if (scenario > state.unlockedScenarios) {
            btn.classList.add('locked');
        }
    });
}

function switchScenario(scenario) {
    if (scenario <= state.unlockedScenarios) {
        state.currentScenario = scenario;
        renderAll();
    }
}

function nextScenario() {
    if (state.currentScenario < Object.keys(scenarios).length) {
        state.currentScenario++;
        state.unlockedScenarios = Math.max(state.unlockedScenarios, state.currentScenario);
        renderAll();
    }
}

function renderAll() {
    renderScenarioNav();
    renderPipeline();
    renderScenarioInfo();
    renderControls();
    renderResults();
    renderInsight();
    renderNextButton();
    renderChart();
}

// Event listeners
document.getElementById('scenarioNav').addEventListener('click', (e) => {
    if (e.target.classList.contains('scenario-btn') && !e.target.classList.contains('locked')) {
        switchScenario(parseInt(e.target.dataset.scenario));
    }
});

document.getElementById('nextBtn').addEventListener('click', nextScenario);

// Intro screen handler
document.getElementById('startBtn').addEventListener('click', () => {
    const introScreen = document.getElementById('introScreen');
    const gameContainer = document.getElementById('gameContainer');

    introScreen.classList.add('fade-out');

    setTimeout(() => {
        introScreen.style.display = 'none';
        gameContainer.style.display = 'block';
        renderAll();
    }, 400);
});
