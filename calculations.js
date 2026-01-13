// Game state
const state = {
    currentScenario: 1,
    unlockedScenarios: 1,
    currentPage: 1, // 1 = setup, 2 = analysis

    // Base parameters
    hurdleRate: 8,
    baseReturn: 11, // Target IRR for the project with no delay
    projectValue: 100, // $100M project for illustration

    // Project structure (renewable energy style)
    capex: 100, // $100M upfront
    opexRate: 4, // $4M per year operating costs (fixed)
    projectLife: 25, // 25 year project life
    constructionTime: 1, // 1 year to build after permits

    // Scenario-specific
    knownDelay: 2,
    shortDelay: 2,
    longDelay: 5,
    shortDelayProb: 50,
    restartProb: 10
};

// Chart instances
let dcfChart = null;
let conclusionChart = null;

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
        description: "Start with the textbook case. You've got a project, you've got a hurdle rate. If returns clear the bar, you build. No permitting, no delays, no uncertainty. Just pure economics.",
        insight: "This is how investment decisions would work in a frictionless world. Projects that pencil out get built; projects that don't, don't. Simple. Of course, this scenario exists approximately nowhere.",
        pipelineType: "simple",
        pipelineStages: [
            { name: "Invest", status: "active" },
            { name: "Build", status: "pending" },
            { name: "Operate", status: "pending" }
        ]
    },
    2: {
        title: "Scenario 2: The Known Delay",
        description: "Now add a permit. Here's the thing: you've already committed capital—land options, interconnection deposits, engineering work. That money is deployed at day zero. The clock starts ticking whether or not you have approval to build.",
        insight: "Even when you know exactly how long a permit takes, delays are brutal. Capital sits idle, earning nothing, while you wait. A 3-year delay doesn't just push your returns back three years—it means three years of zero return on money you've already spent. Watch the IRR decay as you drag the slider right.",
        pipelineType: "simple",
        pipelineStages: [
            { name: "Invest", status: "active" },
            { name: "Permit", status: "delayed" },
            { name: "Build", status: "pending" },
            { name: "Operate", status: "pending" }
        ]
    },
    3: {
        title: "Scenario 3: The Uncertain Delay",
        description: "Worse than waiting is not knowing how long you'll wait. Maybe your application sails through. Maybe it triggers a full Environmental Impact Statement and years of review. You won't know until you're in it.",
        insight: "Here's where it gets interesting: a 50/50 chance between 1 and 3 years is worse than a guaranteed 2-year delay, even though the expected wait time is identical. This isn't intuition—it's math. The present value function is convex, so variance in timing destroys value even when the mean stays constant. Uncertainty has a cost.",
        pipelineType: "branching",
        pipelineStages: [
            { name: "Invest", status: "active" },
            { name: "Permit", status: "delayed" }
        ],
        branches: [
            { name: "Fast Track", time: "Short", status: "maybe" },
            { name: "EIS Review", time: "Long", status: "maybe" }
        ],
        afterBranch: [
            { name: "Build", status: "pending" },
            { name: "Operate", status: "pending" }
        ]
    },
    4: {
        title: "Scenario 4: Litigation Risk",
        description: "You got your permit. Congratulations. Now someone sues, and you're back to square one. New administration, new interpretation, new environmental review. The approval you spent years obtaining just evaporated.",
        insight: "Litigation risk is multiplicative, not additive. A 10% chance of restart doesn't knock 10% off your returns—it creates a probability-weighted cascade of increasingly delayed scenarios. Each loop through the process has another 10% chance of restarting. This is why developers demand massive risk premiums in jurisdictions with litigation exposure, and why some projects that would otherwise pencil out simply don't get built.",
        pipelineType: "recursive",
        pipelineStages: [
            { name: "Invest", status: "active" },
            { name: "Permit", status: "delayed" }
        ],
        branches: [
            { name: "Fast Track", time: "Short", status: "maybe" },
            { name: "EIS Review", time: "Long", status: "maybe" }
        ],
        loopPoint: { name: "Lawsuit?", status: "danger" },
        afterBranch: [
            { name: "Build", status: "pending" },
            { name: "Operate", status: "pending" }
        ]
    }
};

// Rendering functions
function renderPipeline() {
    const pipeline = document.getElementById('pipeline');
    const scenario = scenarios[state.currentScenario];

    let html = '';

    if (scenario.pipelineType === 'simple') {
        // Simple linear flow
        html = '<div class="flow-horizontal">';
        scenario.pipelineStages.forEach((stage, i) => {
            html += `<div class="flow-box ${stage.status}">${stage.name}</div>`;
            if (i < scenario.pipelineStages.length - 1) {
                html += '<div class="flow-arrow">→</div>';
            }
        });
        html += '</div>';
    } else if (scenario.pipelineType === 'branching') {
        // Horizontal flow with permit duration branches
        html = '<div class="flow-horizontal">';

        // Invest
        html += `<div class="flow-box active">Invest</div>`;
        html += '<div class="flow-arrow">→</div>';

        // Permit branches (stacked)
        html += '<div class="permit-branches">';
        html += '<div class="permit-bar short">Short Permit</div>';
        html += '<div class="permit-bar long">Long Permit (EIS)</div>';
        html += '</div>';

        html += '<div class="flow-arrow">→</div>';

        // After permit
        html += `<div class="flow-box pending">Build</div>`;
        html += '<div class="flow-arrow">→</div>';
        html += `<div class="flow-box pending">Operate</div>`;

        html += '</div>';
    } else if (scenario.pipelineType === 'recursive') {
        // Horizontal flow with branches AND recursive loop
        html = '<div class="flow-with-loop">';

        html += '<div class="flow-horizontal">';

        // Invest
        html += `<div class="flow-box active">Invest</div>`;
        html += '<div class="flow-arrow">→</div>';

        // Loop section (permit + lawsuit)
        html += '<div class="loop-section">';

        // Permit branches (stacked)
        html += '<div class="permit-branches">';
        html += '<div class="permit-bar short">Short Permit</div>';
        html += '<div class="permit-bar long">Long Permit (EIS)</div>';
        html += '</div>';

        html += '<div class="flow-arrow">→</div>';

        // Lawsuit check
        html += `<div class="flow-box danger">Lawsuit?</div>`;

        // Elbow connector arrow
        html += '<div class="elbow-arrow">';
        html += '<div class="elbow-down"></div>';
        html += '<div class="elbow-left"></div>';
        html += '<div class="elbow-up"></div>';
        html += '</div>';

        html += '</div>'; // end loop-section

        html += '<div class="flow-arrow">→</div>';

        // After permit
        html += `<div class="flow-box pending">Build</div>`;
        html += '<div class="flow-arrow">→</div>';
        html += `<div class="flow-box pending">Operate</div>`;

        html += '</div>';

        html += '</div>';
    }

    pipeline.innerHTML = html;
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
            <div class="control-value" data-value="hurdleRate">${state.hurdleRate}%</div>
            <input type="range" id="hurdleRate" min="5" max="25" step="1" value="${state.hurdleRate}">
            <div class="slider-labels"><span>5%</span><span>25%</span></div>
        </div>
        <div class="control-group">
            <label class="control-label">Project Base Return</label>
            <div class="control-value" data-value="baseReturn">${state.baseReturn}%</div>
            <input type="range" id="baseReturn" min="5" max="30" step="1" value="${state.baseReturn}">
            <div class="slider-labels"><span>5%</span><span>30%</span></div>
        </div>
    `;

    // Scenario-specific controls
    if (state.currentScenario >= 2) {
        if (state.currentScenario === 2) {
            html += `
                <div class="control-group">
                    <label class="control-label">Permitting Delay (Years)</label>
                    <div class="control-value" data-value="knownDelay">${state.knownDelay} year${state.knownDelay !== 1 ? 's' : ''}</div>
                    <input type="range" id="knownDelay" min="0" max="7" step="1" value="${state.knownDelay}">
                    <div class="slider-labels"><span>0</span><span>7</span></div>
                </div>
            `;
        }
    }

    if (state.currentScenario >= 3) {
        html += `
            <div class="control-group">
                <label class="control-label">Short Delay (Years)</label>
                <div class="control-value" data-value="shortDelay">${state.shortDelay} year${state.shortDelay !== 1 ? 's' : ''}</div>
                <input type="range" id="shortDelay" min="0" max="5" step="1" value="${state.shortDelay}">
                <div class="slider-labels"><span>0</span><span>5</span></div>
            </div>
            <div class="control-group">
                <label class="control-label">Long Delay (Years)</label>
                <div class="control-value" data-value="longDelay">${state.longDelay} year${state.longDelay !== 1 ? 's' : ''}</div>
                <input type="range" id="longDelay" min="${state.shortDelay}" max="10" step="1" value="${state.longDelay}">
                <div class="slider-labels" data-labels="longDelay"><span>${state.shortDelay}</span><span>10</span></div>
            </div>
            <div class="control-group">
                <label class="control-label">Probability of Long Delay</label>
                <div class="control-value" data-value="longDelayProb">${100 - state.shortDelayProb}%</div>
                <input type="range" id="longDelayProb" min="0" max="100" step="1" value="${100 - state.shortDelayProb}">
                <div class="slider-labels"><span>0%</span><span>100%</span></div>
            </div>
            <div class="prob-bar-container" id="probBarContainer">
                <div class="prob-bar">
                    <div class="prob-segment short" style="width: ${state.shortDelayProb}%">${state.shortDelay}yr</div>
                    <div class="prob-segment long" style="width: ${100 - state.shortDelayProb}%">${state.longDelay}yr</div>
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
                <div class="control-value" data-value="restartProb">${state.restartProb}%</div>
                <input type="range" id="restartProb" min="0" max="50" step="1" value="${state.restartProb}">
                <div class="slider-labels"><span>0%</span><span>50%</span></div>
            </div>
        `;
    }

    controls.innerHTML = html;
    attachSliderListeners();
}

function attachSliderListeners() {
    document.querySelectorAll('#controls input[type="range"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const id = e.target.id;

            // Handle longDelayProb specially - convert to shortDelayProb
            if (id === 'longDelayProb') {
                state.shortDelayProb = 100 - value;
            } else {
                state[id] = value;
            }

            // Enforce long delay >= short delay
            if (id === 'shortDelay' && state.longDelay < value) {
                state.longDelay = value;
                const longDelayInput = document.getElementById('longDelay');
                if (longDelayInput) {
                    longDelayInput.value = value;
                    longDelayInput.min = value;
                }
            }
            if (id === 'longDelay' && value < state.shortDelay) {
                state.longDelay = state.shortDelay;
                e.target.value = state.shortDelay;
            }

            // Update display values without re-rendering
            updateControlDisplays();
            renderResults();
            renderChart();
        });
    });
}

function updateControlDisplays() {
    // Update value displays
    const displays = {
        hurdleRate: `${state.hurdleRate}%`,
        baseReturn: `${state.baseReturn}%`,
        knownDelay: `${state.knownDelay} year${state.knownDelay !== 1 ? 's' : ''}`,
        shortDelay: `${state.shortDelay} year${state.shortDelay !== 1 ? 's' : ''}`,
        longDelay: `${state.longDelay} year${state.longDelay !== 1 ? 's' : ''}`,
        longDelayProb: `${100 - state.shortDelayProb}%`,
        restartProb: `${state.restartProb}%`
    };

    Object.keys(displays).forEach(key => {
        const el = document.querySelector(`[data-value="${key}"]`);
        if (el) el.textContent = displays[key];
    });

    // Update long delay min label
    const longDelayLabels = document.querySelector('[data-labels="longDelay"]');
    if (longDelayLabels) {
        longDelayLabels.innerHTML = `<span>${state.shortDelay}</span><span>10</span>`;
    }

    // Update long delay input min
    const longDelayInput = document.getElementById('longDelay');
    if (longDelayInput) {
        longDelayInput.min = state.shortDelay;
    }

    // Update probability bar
    const probBar = document.getElementById('probBarContainer');
    if (probBar) {
        probBar.innerHTML = `
            <div class="prob-bar">
                <div class="prob-segment short" style="width: ${state.shortDelayProb}%">${state.shortDelay}yr</div>
                <div class="prob-segment long" style="width: ${100 - state.shortDelayProb}%">${state.longDelay}yr</div>
            </div>
            <div class="prob-legend">
                <div class="legend-item"><div class="legend-dot" style="background: var(--accent-green)"></div> Short delay</div>
                <div class="legend-item"><div class="legend-dot" style="background: var(--accent-yellow)"></div> Long delay</div>
            </div>
        `;
    }
}

function renderResults() {
    const cashFlowData = generateCashFlows();
    const irr = cashFlowData.irr;
    const npv = cashFlowData.npv;
    const delay = getExpectedDelay();

    // Calculate baseline NPV (what NPV would be with no delay)
    const baselineNPV = calculateBaselineNPV();
    const npvLost = baselineNPV - npv;

    const willInvest = irr >= state.hurdleRate; // Decision based on IRR vs hurdle rate
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
        ? `IRR of ${irr.toFixed(1)}% exceeds ${state.hurdleRate}% hurdle rate`
        : `IRR of ${irr.toFixed(1)}% is below ${state.hurdleRate}% hurdle rate`;

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
    // Years 1 to delay: Waiting for permits
    // After delay: Operations for projectLife years

    // Get the annual revenue that corresponds to the target IRR
    const annualRevenue = getAnnualRevenue();
    const annualNetCF = annualRevenue - state.opexRate;

    const years = [];
    const annualCashFlows = [];
    const cumulativeNominal = [];
    const cumulativeDiscounted = [];

    let cumNominal = 0;
    let cumDiscounted = 0;

    // Calculate NPV properly accounting for fractional delay
    // CAPEX at year 0
    let npv = -state.capex;

    // Discount operating cash flows from when they actually start
    // Operations begin after delay and run for projectLife years
    for (let i = 0; i < state.projectLife; i++) {
        const yearOfCashFlow = delay + 1 + i; // First CF is at delay + 1
        npv += annualNetCF / Math.pow(1 + state.hurdleRate / 100, yearOfCashFlow);
    }

    // For display purposes, still generate year-by-year data using floored delay
    const operationsStart = Math.floor(delay) + 1;
    const operationsEnd = Math.floor(delay) + state.projectLife;
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

    // Calculate IRR using the precise delay
    const preciseCashFlows = [-state.capex];
    const delayYears = Math.ceil(delay);
    for (let i = 0; i < delayYears; i++) {
        preciseCashFlows.push(0);
    }
    for (let i = 0; i < state.projectLife; i++) {
        preciseCashFlows.push(annualNetCF);
    }

    return {
        years,
        annualCashFlows,
        cumulativeNominal,
        cumulativeDiscounted,
        delay,
        operationsStart,
        operationsEnd,
        npv: npv, // Use precisely calculated NPV
        paybackNominal: findPayback(years, cumulativeNominal),
        paybackDiscounted: findPayback(years, cumulativeDiscounted),
        irr: calculateIRR(preciseCashFlows),
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

    if (state.currentScenario < 4) {
        nextBtn.textContent = `Continue to Scenario ${state.currentScenario + 1} →`;
        nextBtn.disabled = false;
    } else if (state.currentScenario === 4) {
        nextBtn.textContent = 'See the Conclusion →';
        nextBtn.disabled = false;
    } else {
        nextBtn.textContent = 'All scenarios complete!';
        nextBtn.disabled = true;
    }
}

// Calculate NPV for a specific scenario configuration
function calculateScenarioNPV(scenarioNum) {
    const annualRevenue = getAnnualRevenue();
    const annualNetCF = annualRevenue - state.opexRate;

    let delay;
    switch (scenarioNum) {
        case 1:
            delay = 0;
            break;
        case 2:
            delay = state.knownDelay;
            break;
        case 3:
        case 4:
            const p_short = state.shortDelayProb / 100;
            const p_long = 1 - p_short;
            let expectedSingleDelay = p_short * state.shortDelay + p_long * state.longDelay;

            if (scenarioNum >= 4) {
                const p_restart = state.restartProb / 100;
                const expectedAttempts = 1 / (1 - p_restart);
                delay = expectedSingleDelay * expectedAttempts;
            } else {
                delay = expectedSingleDelay;
            }
            break;
        default:
            delay = 0;
    }

    // Calculate NPV
    let npv = -state.capex;
    for (let i = 0; i < state.projectLife; i++) {
        const yearOfCashFlow = delay + 1 + i;
        npv += annualNetCF / Math.pow(1 + state.hurdleRate / 100, yearOfCashFlow);
    }
    return npv;
}

function renderConclusionChart() {
    const ctx = document.getElementById('conclusionChart').getContext('2d');

    // Calculate NPVs for all scenarios
    const npvs = [
        calculateScenarioNPV(1),
        calculateScenarioNPV(2),
        calculateScenarioNPV(3),
        calculateScenarioNPV(4)
    ];

    const scenarioLabels = [
        'Baseline',
        'Known Delay',
        'Uncertain Delay',
        'Judicial Risk'
    ];

    if (conclusionChart) {
        conclusionChart.destroy();
    }

    conclusionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: scenarioLabels,
            datasets: [{
                label: 'Net Present Value ($M)',
                data: npvs,
                backgroundColor: npvs.map(v => v >= 0 ? 'rgba(74, 222, 128, 0.7)' : 'rgba(248, 113, 113, 0.7)'),
                borderColor: npvs.map(v => v >= 0 ? '#16a34a' : '#dc2626'),
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
                        label: (item) => {
                            const value = item.parsed.y;
                            const sign = value >= 0 ? '+' : '';
                            return `NPV: ${sign}$${value.toFixed(1)}M`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#6b6560',
                        font: {
                            family: 'JetBrains Mono',
                            size: 11,
                            weight: 600
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'NPV ($M)',
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
}

function renderConclusionSummary() {
    const summary = document.getElementById('conclusionSummary');

    const npvs = [
        { name: 'Baseline (No Delay)', npv: calculateScenarioNPV(1), delay: 0 },
        { name: `Known Delay (${state.knownDelay.toFixed(1)} yrs)`, npv: calculateScenarioNPV(2), delay: state.knownDelay },
        { name: 'Uncertain Delay', npv: calculateScenarioNPV(3), delay: state.shortDelayProb / 100 * state.shortDelay + (1 - state.shortDelayProb / 100) * state.longDelay },
        { name: `+ Judicial Risk (${state.restartProb}% restart)`, npv: calculateScenarioNPV(4), delay: getExpectedDelayForScenario(4) }
    ];

    const baselineNPV = npvs[0].npv;

    let html = '';
    npvs.forEach((scenario, i) => {
        const valueLost = baselineNPV - scenario.npv;
        const percentLost = baselineNPV > 0 ? (valueLost / baselineNPV * 100) : 0;
        const npvClass = scenario.npv >= 0 ? 'positive' : 'negative';

        html += `
            <div class="result-row">
                <span class="result-label">${scenario.name}</span>
                <span class="result-value ${npvClass}">${scenario.npv >= 0 ? '+' : ''}$${scenario.npv.toFixed(1)}M</span>
            </div>
        `;

        if (i > 0) {
            html += `
                <div class="result-row" style="padding-left: 1rem; border-bottom: none; padding-top: 0;">
                    <span class="result-label" style="font-size: 0.7rem; color: var(--accent-red);">↳ Value destroyed from baseline</span>
                    <span class="result-value negative" style="font-size: 0.8rem;">-$${valueLost.toFixed(1)}M (${percentLost.toFixed(0)}%)</span>
                </div>
            `;
        }
    });

    summary.innerHTML = html;
}

function getExpectedDelayForScenario(scenarioNum) {
    switch (scenarioNum) {
        case 1:
            return 0;
        case 2:
            return state.knownDelay;
        case 3:
        case 4:
            const p_short = state.shortDelayProb / 100;
            const p_long = 1 - p_short;
            let expectedSingleDelay = p_short * state.shortDelay + p_long * state.longDelay;

            if (scenarioNum >= 4) {
                const p_restart = state.restartProb / 100;
                const expectedAttempts = 1 / (1 - p_restart);
                return expectedSingleDelay * expectedAttempts;
            }
            return expectedSingleDelay;
        default:
            return 0;
    }
}

function showConclusionPage() {
    state.currentScenario = 5;
    state.unlockedScenarios = 5;

    // Hide all scenario pages
    document.getElementById('scenarioPage1').classList.remove('active');
    document.getElementById('scenarioPage2').classList.remove('active');
    document.getElementById('conclusionPage').classList.add('active');

    renderScenarioNav();
    renderConclusionChart();
    renderConclusionSummary();
}

function showScenarioPage(pageNum) {
    state.currentPage = pageNum;
    const page1 = document.getElementById('scenarioPage1');
    const page2 = document.getElementById('scenarioPage2');
    const conclusionPage = document.getElementById('conclusionPage');

    page1.classList.remove('active');
    page2.classList.remove('active');
    conclusionPage.classList.remove('active');

    if (pageNum === 1) {
        page1.classList.add('active');
    } else {
        page2.classList.add('active');
        // Re-render chart when showing analysis page
        renderChart();
    }
}

function goBackToIntro() {
    const introScreen = document.getElementById('introScreen');
    const gameContainer = document.getElementById('gameContainer');

    gameContainer.style.display = 'none';
    introScreen.style.display = 'flex';
    introScreen.classList.remove('fade-out');

    // Go to last intro page
    currentIntroPage = 4;
    showIntroPage(currentIntroPage);
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
        if (scenario === 5) {
            showConclusionPage();
        } else {
            // Hide conclusion page if visible
            document.getElementById('conclusionPage').classList.remove('active');

            state.currentScenario = scenario;
            state.currentPage = 1;
            showScenarioPage(1);
            renderAll();
        }
    }
}

function nextScenario() {
    if (state.currentScenario < 4) {
        state.currentScenario++;
        state.unlockedScenarios = Math.max(state.unlockedScenarios, state.currentScenario);
        state.currentPage = 1;
        showScenarioPage(1);
        renderAll();
    } else if (state.currentScenario === 4) {
        showConclusionPage();
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

// Page navigation buttons
document.getElementById('toAnalysisBtn').addEventListener('click', () => {
    showScenarioPage(2);
});

document.getElementById('backToSetupBtn').addEventListener('click', () => {
    showScenarioPage(1);
});

document.getElementById('backToIntroBtn').addEventListener('click', () => {
    if (state.currentScenario === 1) {
        goBackToIntro();
    } else {
        // Go to previous scenario's analysis page
        state.currentScenario--;
        showScenarioPage(2);
        renderAll();
    }
});

// Conclusion page buttons
document.getElementById('backToScenario4Btn').addEventListener('click', () => {
    document.getElementById('conclusionPage').classList.remove('active');
    state.currentScenario = 4;
    showScenarioPage(2);
    renderAll();
});

document.getElementById('restartBtn').addEventListener('click', () => {
    // Reset state
    state.currentScenario = 1;
    state.unlockedScenarios = 1;
    state.currentPage = 1;

    // Hide conclusion, show intro
    document.getElementById('conclusionPage').classList.remove('active');
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('introScreen').style.display = 'flex';
    document.getElementById('introScreen').classList.remove('fade-out');

    currentIntroPage = 0;
    showIntroPage(currentIntroPage);
});

// Intro screen handler
let currentIntroPage = 0;
const totalIntroPages = 5;

function showIntroPage(pageNum) {
    const pages = document.querySelectorAll('.intro-page');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.querySelector(`.intro-page[data-page="${pageNum}"]`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

// Next page buttons
document.querySelectorAll('.next-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentIntroPage++;
        showIntroPage(currentIntroPage);
    });
});

// Start game button
document.getElementById('startGameBtn').addEventListener('click', () => {
    const introScreen = document.getElementById('introScreen');
    const gameContainer = document.getElementById('gameContainer');

    introScreen.classList.add('fade-out');

    setTimeout(() => {
        introScreen.style.display = 'none';
        gameContainer.style.display = 'block';
        renderAll();
    }, 400);
});

// Enter key navigation
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;

    // Don't trigger if user is focused on an input element
    if (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA') {
        return;
    }

    const introScreen = document.getElementById('introScreen');
    const gameContainer = document.getElementById('gameContainer');

    // Handle intro screen navigation
    if (introScreen.style.display !== 'none' && !introScreen.classList.contains('fade-out')) {
        if (currentIntroPage < totalIntroPages - 1) {
            // Go to next intro page
            currentIntroPage++;
            showIntroPage(currentIntroPage);
        } else {
            // On last intro page, start the game
            document.getElementById('startGameBtn').click();
        }
        return;
    }

    // Handle game/scenario navigation
    if (gameContainer.style.display !== 'none') {
        const conclusionPage = document.getElementById('conclusionPage');

        // If on conclusion page
        if (conclusionPage.classList.contains('active')) {
            // Enter restarts the game
            document.getElementById('restartBtn').click();
            return;
        }

        // If on scenario page 1 (setup), go to analysis
        if (state.currentPage === 1) {
            document.getElementById('toAnalysisBtn').click();
            return;
        }

        // If on scenario page 2 (analysis), go to next scenario
        if (state.currentPage === 2) {
            document.getElementById('nextBtn').click();
            return;
        }
    }
});
