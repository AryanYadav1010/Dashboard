import React, { useState, useEffect, useMemo } from "react";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { TrendingUp, TrendingDown, Filter } from "lucide-react";
import { colorForValue } from "../lib/colors";

// Ranking palette, worst (dark brown) -> best (cream).
const COLOR_STOPS = [
  "#5D4037", "#795548", "#8D6E63", "#A1887F", "#D7A86E",
  "#E8B960", "#F5CB5C", "#FFE082", "#FFF8E1"
];

// Value ranges for the "Category" filter.
const BUCKET_RANGES = {
  high: [0.75, 1.01],
  "medium-high": [0.5, 0.75],
  "medium-low": [0.25, 0.5],
  low: [0, 0.25],
};

/**
 * Left-hand ranked list of countries for the selected indicator, with sort and category filters.
 * Data is fetched by App and passed in as `data` (ISO alpha-2 -> { name, value, year }).
 */
const RankingPanel = ({
  data,
  loading,
  onCountrySelect,
  selectedCountry,
  selectedIndicator,
  indicatorName,
  lowerIsBetter,
  source,
}) => {
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterBucket, setFilterBucket] = useState("all");

  // Default to "best first" whenever the indicator changes.
  useEffect(() => {
    setSortOrder(lowerIsBetter ? "asc" : "desc");
  }, [lowerIsBetter, selectedIndicator]);

  const rankedCountries = useMemo(() => {
    let countries = Object.entries(data).map(([code, row]) => ({ code, ...row }));
    if (filterBucket !== "all") {
      const [min, max] = BUCKET_RANGES[filterBucket];
      countries = countries.filter((c) => c.value >= min && c.value < max);
    }
    return countries.sort((a, b) => (sortOrder === "desc" ? b.value - a.value : a.value - b.value));
  }, [data, sortOrder, filterBucket]);

  return (
    <div className={`ranking-panel ${selectedIndicator}`} data-testid="ranking-panel">
      <div className="ranking-header">
        <h2 className="ranking-title">{indicatorName || "Ranking"}</h2>
        <p className="ranking-subtitle">{rankedCountries.length} countries</p>
      </div>

      {/* Filters */}
      <div className="ranking-filters">
        <div className="filter-group">
          <label className="filter-label" htmlFor="sort-order-select">
            <Filter className="w-3 h-3" aria-hidden="true" />
            Sort
          </label>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="filter-select" id="sort-order-select" data-testid="sort-order-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" style={{ color: "#FFF8E1" }} />
                  {lowerIsBetter ? "Worst First (Highest)" : "Best First (Highest)"}
                </span>
              </SelectItem>
              <SelectItem value="asc">
                <span className="flex items-center gap-2">
                  <TrendingDown className="w-3 h-3" style={{ color: "#5D4037" }} />
                  {lowerIsBetter ? "Best First (Lowest)" : "Worst First (Lowest)"}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="filter-group">
          <label className="filter-label" htmlFor="filter-bucket-select">Category</label>
          <Select value={filterBucket} onValueChange={setFilterBucket}>
            <SelectTrigger className="filter-select" id="filter-bucket-select" data-testid="filter-bucket-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#FFF8E1" }} />
                  {lowerIsBetter ? "High/Worse (0.75-1.0)" : "High/Better (0.75-1.0)"}
                </span>
              </SelectItem>
              <SelectItem value="medium-high">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#D7A86E" }} />
                  Medium-High (0.5-0.75)
                </span>
              </SelectItem>
              <SelectItem value="medium-low">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#8D6E63" }} />
                  Medium-Low (0.25-0.5)
                </span>
              </SelectItem>
              <SelectItem value="low">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#5D4037" }} />
                  {lowerIsBetter ? "Low/Better (0-0.25)" : "Low/Worse (0-0.25)"}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Ranking List */}
      <ScrollArea className="ranking-list">
        <div aria-live="polite">
          {loading ? (
            <div className="ranking-loading">Loading rankings...</div>
          ) : rankedCountries.length === 0 ? (
            <div className="ranking-empty">No countries match the filter</div>
          ) : null}
        </div>
        {!loading && rankedCountries.length > 0 && (
          <div className="ranking-items">
            {rankedCountries.map((country, index) => {
              const isSelected = selectedCountry === country.code;
              const rank = index + 1;
              const color = colorForValue(country.value, COLOR_STOPS, lowerIsBetter);
              // For lowerIsBetter indicators (populism, gender), invert the bar fill
              // so the "best" country (lowest value) shows the fullest bar
              const barFill = lowerIsBetter
                ? (1 - country.value) * 100
                : country.value * 100;

              return (
                <button
                  type="button"
                  key={country.code}
                  className={`ranking-item ${isSelected ? "selected" : ""}`}
                  onClick={() => onCountrySelect({ code: country.code, name: country.name })}
                  data-testid={`ranking-item-${country.code}`}
                  aria-label={`${country.name}, rank ${rank}, score ${country.value.toFixed(2)}`}
                  aria-pressed={isSelected}
                >
                  <div className="ranking-position">
                    <span className="rank-number" style={{ color }}>#{rank}</span>
                  </div>

                  <div className="ranking-info">
                    <span className="ranking-country-name">{country.name}</span>
                    <div className="ranking-bar-container">
                      <div
                        className="ranking-bar"
                        style={{ width: `${barFill}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>

                  <div className="ranking-value">
                    <Badge
                      variant="outline"
                      className="ranking-badge"
                      style={{ color, borderColor: color }}
                    >
                      {country.value.toFixed(2)}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="ranking-footer">
        {source && <span className="ranking-source">Source: {source}</span>}
      </div>
    </div>
  );
};

export default RankingPanel;
