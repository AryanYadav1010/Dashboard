import React, { useState, useCallback, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Globe2, Info } from "lucide-react";
import "@/App.css";
import { API } from "@/lib/api";
import WorldMap from "./components/WorldMap";
import CountryPanel from "./components/CountryPanel";
import CountrySearch from "./components/CountrySearch";
import RankingPanel from "./components/RankingPanel";
import { Toaster } from "./components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

/**
 * Top-level layout and shared state.
 * Owns the selected indicator and its data (fetched once, shared by the map and the ranking)
 * and the selected country (opens the news panel).
 */
function App() {
  const [indicators, setIndicators] = useState([]);
  const [selectedIndicator, setSelectedIndicator] = useState("liberal");
  const [indicatorData, setIndicatorData] = useState({});
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedCountry, setSelectedCountry] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [highlightedCountry, setHighlightedCountry] = useState(null);

  // Indicator list for the header dropdown.
  useEffect(() => {
    axios
      .get(`${API}/indicators`)
      .then((res) => setIndicators(res.data.indicators || []))
      .catch((err) => {
        console.error("Error fetching indicators:", err);
        toast.error("Could not reach the backend");
      });
  }, []);

  // Values for the selected indicator, keyed by ISO alpha-2 code.
  useEffect(() => {
    setDataLoading(true);
    axios
      .get(`${API}/indicators/${selectedIndicator}`)
      .then((res) => setIndicatorData(res.data.data || {}))
      .catch((err) => {
        console.error("Error fetching indicator data:", err);
        setIndicatorData({});
      })
      .finally(() => setDataLoading(false));
  }, [selectedIndicator]);

  const currentIndicator = indicators.find((i) => i.id === selectedIndicator);
  const indicatorName = currentIndicator?.name;
  const lowerIsBetter = currentIndicator?.lower_is_better || false;

  // Shared by the map, the ranking list and the search box.
  const handleCountrySelect = useCallback(
    (country) => {
      // Search results carry no score, so look it up here.
      const row = indicatorData[country.code];
      const selected = row
        ? { ...country, indicatorValue: row.value, indicatorYear: row.year }
        : country;

      setSelectedCountry(selected);
      setIsPanelOpen(true);
      setHighlightedCountry(null);
      toast.success(`Selected: ${selected.name}`, {
        description: row ? `${indicatorName}: ${row.value.toFixed(3)}` : "No data for this indicator",
        duration: 2000,
      });
    },
    [indicatorData, indicatorName]
  );

  const handlePanelClose = useCallback((open) => {
    setIsPanelOpen(open);
    if (!open) setSelectedCountry(null);
  }, []);

  const handleIndicatorChange = useCallback(
    (value) => {
      setSelectedIndicator(value);
      const name = indicators.find((i) => i.id === value)?.name || value;
      toast.info(`Switched to: ${name}`, { duration: 1500 });
    },
    [indicators]
  );

  return (
    <div className="app-container" data-testid="app-container">
      <header className="app-header">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <Globe2 className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="header-title" data-testid="app-title">
                Rebalance Global Observatory
              </h1>
              <p className="header-subtitle">Interactive geopolitical data dashboard</p>
            </div>
          </div>

          <div className="indicator-selector" data-testid="indicator-selector">
            <Select value={selectedIndicator} onValueChange={handleIndicatorChange}>
              <SelectTrigger className="indicator-select-trigger">
                <SelectValue placeholder="Select Indicator" />
              </SelectTrigger>
              <SelectContent>
                {indicators.map((indicator) => (
                  <SelectItem key={indicator.id} value={indicator.id}>
                    {indicator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <RankingPanel
        data={indicatorData}
        loading={dataLoading}
        onCountrySelect={handleCountrySelect}
        selectedCountry={selectedCountry?.code}
        selectedIndicator={selectedIndicator}
        indicatorName={indicatorName}
        lowerIsBetter={lowerIsBetter}
        source={currentIndicator?.source}
      />

      <CountrySearch
        onCountrySelect={handleCountrySelect}
        onCountryHighlight={setHighlightedCountry}
      />

      <WorldMap
        data={indicatorData}
        loading={dataLoading}
        onCountrySelect={handleCountrySelect}
        selectedCountry={selectedCountry?.code}
        highlightedCountry={highlightedCountry}
        indicatorName={indicatorName}
        lowerIsBetter={lowerIsBetter}
        source={currentIndicator?.source}
      />

      <CountryPanel
        isOpen={isPanelOpen}
        onClose={handlePanelClose}
        country={selectedCountry}
        indicatorName={indicatorName}
        selectedIndicator={selectedIndicator}
      />

      <div className="instructions-overlay" data-testid="instructions">
        <Info className="w-4 h-4 inline-block mr-2 text-slate-500" />
        Click on any country or use the ranking to view details
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: "#0f172a", border: "1px solid #1e293b", color: "#f8fafc" },
        }}
      />
    </div>
  );
}

export default App;
