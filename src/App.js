import { useState, useEffect } from "react";
import {
  ScatterChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { levenbergMarquardt as LM } from "ml-levenberg-marquardt";

/* ------------  fake well DB  ------------ */
const wellDB = {
  A: { name: "Well A", qi: 1000, data: [1000, 850, 760, 690, 630, 590, 555, 520, 490, 460, 430, 405, 390] },
  B: { name: "Well B", qi: 800,  data: [800, 720, 645, 585, 540, 500, 465, 435, 410, 385, 365, 350, 335] },
  C: { name: "Well C", qi: 1200, data: [1200, 1020, 915, 825, 750, 690, 640, 600, 565, 535, 510, 490, 470] },
};

const months = Array.from({ length: 13 }, (_, m) => m);

/* ------------  decline helpers  ------------ */
function qHyper(qi, di, b, t) {
  return qi / Math.pow(1 + b * di * t, 1 / b);
}
function qExp(qi, di, t)       { return qi * Math.exp(-di * t); }
function qHarm(qi, di, t)      { return qi / (1 + di * t); }

function genCurve(type, qi, di, b = 1.0) {
  return months.map((m) => ({
    month: m,
    rate:
      type === "exp"
        ? qExp(qi, di, m)
        : type === "harm"
        ? qHarm(qi, di, m)
        : qHyper(qi, di, b, m),
  }));
}

/* ------------  LM auto-fit  ------------ */
function autoFitLM(type, qi, actual) {
  const xData = months;
  const yData = actual.map((d) => d.rate);

  const model =
    type === "exp"
      ? ([di]) => (t) => qExp(qi, di, t)
      : type === "harm"
      ? ([di]) => (t) => qHarm(qi, di, t)
      : ([di, b]) => (t) => qHyper(qi, di, b, t);

  const initial =
    type === "hyper" ? { initialValues: [0.6, 1.1] } : { initialValues: [0.6] };

  const { parameterValues } = LM({ x: xData, y: yData }, model, initial);

  return type === "hyper"
    ? { di: parameterValues[0], b: parameterValues[1] }
    : { di: parameterValues[0] };
}

/* ------------  React component  ------------ */
export default function App() {
  const [wellKey, setWellKey] = useState("A");
  const [model, setModel] = useState("hyper");      // exp | harm | hyper
  const [bFactor, setBFactor] = useState(1.2);
  const [declineRate, setDeclineRate] = useState(0.7);
  const [fitCurve, setFitCurve] = useState(null);

  const well = wellDB[wellKey];
  const actual = well.data.map((r, i) => ({ month: i, rate: r }));
  const manualCurve = genCurve(model, well.qi, declineRate, bFactor);

  /* --- cumulative bbl --- */
  const cum = manualCurve.reduce((sum, p) => sum + p.rate * 30, 0).toFixed(0);

  /* --- reset on well/model change --- */
  useEffect(() => {
    setBFactor(1.2);
    setDeclineRate(0.7);
    setFitCurve(null);
  }, [wellKey, model]);

  /* --- run optimizer --- */
  const runFit = () => {
    const res = autoFitLM(model, well.qi, actual);
    setDeclineRate(res.di);
    if (res.b) setBFactor(res.b);
    setFitCurve(genCurve(model, well.qi, res.di, res.b ?? bFactor).slice(0,13));
  };

  const reset = () => {
    setBFactor(1.2);
    setDeclineRate(0.7);
    setFitCurve(null);
  };

  /* --- UI --- */
  return (
    <div style={{ padding: "1rem 2rem", fontFamily: "sans-serif" }}>
      <h2>{well.name} – Monthly Oil Production</h2>

      {/* Well + model selectors */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <label>
          Well:&nbsp;
          <select value={wellKey} onChange={(e) => setWellKey(e.target.value)}>
            {Object.keys(wellDB).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>

        <label>
          Model:&nbsp;
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="exp">Exponential</option>
            <option value="harm">Harmonic</option>
            <option value="hyper">Hyperbolic</option>
          </select>
        </label>
      </div>

      {/* Sliders */}
      {model === "hyper" && (
        <>
          <p>
            <strong>b-factor:</strong> {bFactor.toFixed(2)}
          </p>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.01"
            value={bFactor}
            onChange={(e) => setBFactor(parseFloat(e.target.value))}
            style={{ width: 250, marginBottom: "1rem" }}
          />
        </>
      )}

      <p>
        <strong>Di:</strong> {declineRate.toFixed(2)}
      </p>
      <input
        type="range"
        min="0.1"
        max="1.0"
        step="0.01"
        value={declineRate}
        onChange={(e) => setDeclineRate(parseFloat(e.target.value))}
        style={{ width: 250, marginBottom: "1.5rem" }}
      />

      {/* Buttons */}
      <button onClick={runFit} style={{ marginRight: 10 }}>
        Auto-fit (green)
      </button>
      <button onClick={reset}>Reset</button>

      {/* Cumulative */}
      <p style={{ marginTop: 10 }}>
        <strong>Cumulative (red curve):</strong> {cum} bbl
      </p>
{fitCurve && (
  <p>
    <strong>Cumulative (green curve):</strong>{" "}
    {fitCurve.reduce((sum, p) => sum + p.rate * 30, 0).toFixed(0)} bbl
  </p>
)}
      {/* Chart */}

  <ResponsiveContainer width="100%" height={420}>
  <ScatterChart>
    <CartesianGrid />
    <XAxis
      type="number"
      dataKey="month"
      domain={[0, 12]}
      ticks={months}
      label={{ value: "Month", position: "insideBottom" }}
    />
    <YAxis
      type="number"
      dataKey="rate"
      label={{ value: "Rate (BOPD)", angle: -90, position: "insideLeft" }}
    />
    <Tooltip />
    <Scatter data={actual} name="Actual" fill="#2563eb" />
    <Line type="linear" data={manualCurve} dataKey="rate" stroke="red" dot={false} name="Manual fit" />
    {fitCurve && (
      <Line type="linear" data={fitCurve} dataKey="rate" stroke="green" dot={false} name="Auto-LM fit" />
    )}
  </ScatterChart>
</ResponsiveContainer>

    </div>
  );
}
