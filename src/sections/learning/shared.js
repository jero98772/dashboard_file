import { createContext, useContext } from 'react';
import { format as d3format } from 'd3-format';

/** Thousands separator for XP. */
export const fmt = d3format(',');

/** Hover tooltip, rendered once by Learning.jsx and positioned inside its wrapper. */
export const TipCtx = createContext({ show() {}, hide() {} });
export const useTip = () => useContext(TipCtx);
