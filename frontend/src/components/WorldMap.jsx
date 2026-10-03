import React, { useState, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { getAlpha2Code, getCountryName } from "../lib/countries";
import { colorForValue } from "../lib/colors";

// World country shapes (TopoJSON, UN M49 numeric ids).
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Choropleth scale, worst (red) -> best (pale yellow).
const COLOR_STOPS = ["#dc2626", "#ea580c", "#f97316", "#facc15", "#fef08a"];
const NO_DATA_COLOR = "#475569";
const DEFAULT_VIEW = { coordinates: [0, 20], zoom: 1 };

/**
 * Zoomable choropleth of the selected indicator, with hover tooltip and legend.
 * Data is fetched by App and passed in as `data` (ISO alpha-2 -> { name, value, year }).
 */
function WorldMap({
  data,
  loading,
  onCountrySelect,
  selectedCountry,
  highlightedCountry,
  indicatorName,
  lowerIsBetter = false,
  source,
}) {
  const [tooltip, setTooltip] = useState(null);
  const [position, setPosition] = useState(DEFAULT_VIEW);

  const handleCountryClick = useCallback((geo) => {
    const alpha2 = getAlpha2Code(geo);
    if (alpha2) onCountrySelect({ code: alpha2, name: getCountryName(geo) });
  }, [onCountrySelect]);

  const handleMouseEnter = useCallback((geo, event) => {
    const countryData = data[getAlpha2Code(geo)];
    setTooltip({
      name: getCountryName(geo),
      value: countryData?.value,
      year: countryData?.year,
      x: event.clientX,
      y: event.clientY,
    });
  }, [data]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleMouseMove = useCallback((event) => {
    if (tooltip) {
      setTooltip(prev => ({ ...prev, x: event.clientX, y: event.clientY }));
    }
  }, [tooltip]);

  const handleMoveEnd = useCallback((position) => {
    setPosition(position);
  }, []);

  const handleZoomIn = useCallback(() => {
    setPosition((prev) => ({ ...prev, zoom: Math.min(8, prev.zoom * 1.5) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPosition((prev) => ({ ...prev, zoom: Math.max(1, prev.zoom / 1.5) }));
  }, []);

  const handleResetView = useCallback(() => {
    setPosition(DEFAULT_VIEW);
  }, []);

  const getCountryFill = useCallback((alpha2) => {
    const value = data[alpha2]?.value;
    if (loading || value === undefined) return NO_DATA_COLOR;
    return colorForValue(value, COLOR_STOPS, lowerIsBetter);
  }, [data, loading, lowerIsBetter]);

  return (
    <div
      className="world-map-container"
      data-testid="world-map-container"
      onMouseMove={handleMouseMove}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [0, 30] }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      >
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          onMoveEnd={handleMoveEnd}
          minZoom={1}
          maxZoom={8}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const alpha2 = getAlpha2Code(geo);
                const fillColor = getCountryFill(alpha2);
                const isSelected = selectedCountry && alpha2 === selectedCountry.toLowerCase();
                const isHighlighted = highlightedCountry && alpha2 === highlightedCountry.toLowerCase();

                const countryName = getCountryName(geo);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    data-testid={`country-${alpha2 || geo.id}`}
                    onClick={() => handleCountryClick(geo)}
                    onMouseEnter={(e) => handleMouseEnter(geo, e)}
                    onMouseLeave={handleMouseLeave}
                    tabIndex={0}
                    role="button"
                    aria-label={`Select ${countryName}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCountryClick(geo);
                      }
                    }}
                    style={{
                      default: {
                        fill: fillColor,
                        stroke: isSelected ? "#ffffff" : isHighlighted ? "#3b82f6" : "#334155",
                        strokeWidth: isSelected ? 2 : isHighlighted ? 1.5 : 0.5,
                        outline: "none",
                      },
                      hover: {
                        fill: fillColor,
                        stroke: "#ffffff",
                        strokeWidth: 1,
                        outline: "none",
                        filter: "brightness(1.1)",
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: fillColor,
                        stroke: "#ffffff",
                        strokeWidth: 1.5,
                        outline: "none",
                        filter: "brightness(0.95)",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      <div className="map-zoom-controls" role="group" aria-label="Map zoom controls">
        <button type="button" className="map-zoom-btn" onClick={handleZoomIn} aria-label="Zoom in">+</button>
        <button type="button" className="map-zoom-btn" onClick={handleZoomOut} aria-label="Zoom out">−</button>
        <button type="button" className="map-zoom-btn" onClick={handleResetView} aria-label="Reset map view">⟲</button>
      </div>

      {tooltip && (
        <div className="country-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <span className="country-tooltip-name">{tooltip.name}</span>
          {tooltip.value !== undefined && (
            <div className="country-tooltip-value">
              {indicatorName || "Value"}: <strong>{tooltip.value.toFixed(3)}</strong>
              <span className="text-xs text-slate-400 ml-1">({tooltip.year})</span>
            </div>
          )}
        </div>
      )}

      {/* Legend: colour bands flip their labels when lower values are better */}
      <div className="map-legend" data-testid="map-legend">
        <div className="legend-title">{indicatorName || "Index"}</div>
        <div className="legend-scale">
          {/* Each colour stop marks a value; listed from worst to best */}
          {COLOR_STOPS.map((color, i) => {
            const step = i / (COLOR_STOPS.length - 1);
            const value = lowerIsBetter ? 1 - step : step;
            const note = i === 0 ? " (Worse)" : i === COLOR_STOPS.length - 1 ? " (Better)" : "";
            return (
              <div className="legend-item" key={color}>
                <span className="legend-color" style={{ background: color }}></span>
                <span className="legend-label">{value.toFixed(2)}{note}</span>
              </div>
            );
          })}
          <div className="legend-item">
            <span className="legend-color" style={{ background: NO_DATA_COLOR }}></span>
            <span className="legend-label">No Data</span>
          </div>
        </div>
        {source && <div className="legend-source">Source: {source}</div>}
      </div>
    </div>
  );
}

export default WorldMap;
