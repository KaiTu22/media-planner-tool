import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getPackageMetricInfo,
  calculateInvestmentCategoryBreakdown,
  categorizeSponsorshipLineItem,
  makeEmptyInvestmentBreakdownCats,
  calculateOverallTotals,
  calculateFullInvestmentBreakdown,
  getPlacementTypeLabel
} from '../calculations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DATA_DIR = path.join(__dirname, '..', 'test-data');

describe('calculateOverallTotals', () => {
  it('sums investment, cost, and margin for a simple package', () => {
    // Note: 'streaming' packages carry their impression count on `impressions`,
    // not `totalImpressions` (that field is used by other package types) —
    // calculateOverallTotals branches on package type for exactly this reason.
    const totals = calculateOverallTotals([
      { type: 'streaming', totalInvestment: 1000, totalCost: 600, impressions: 100000 }
    ]);
    expect(totals.totalPrice).toBe(1000);
    expect(totals.totalCost).toBe(600);
    expect(totals.totalMarginDollar).toBe(400);
    expect(totals.totalMarginPercent).toBe(40);
    expect(totals.totalImpressions).toBe(100000);
    expect(totals.overallCPM).toBe(10);
  });

  it('excludes Added Value packages from investment/cost/margin, tracking them separately', () => {
    const totals = calculateOverallTotals([
      { type: 'streaming', totalInvestment: 1000, totalCost: 600 },
      { type: 'added-value', totalInvestment: 0, totalCost: 200, totalValue: 5000 }
    ]);
    expect(totals.totalPrice).toBe(1000);
    expect(totals.totalCost).toBe(600);
    expect(totals.addedValueCost).toBe(200);
    expect(totals.addedValueValue).toBe(5000);
  });

  it('separates CPV (X Amplify) packages from CPM packages', () => {
    const totals = calculateOverallTotals([
      { type: 'partnership', partnershipType: 'x_amplify', pricingMetric: 'cpv', totalInvestment: 500, views: 10000, cpv: 0.05 }
    ]);
    expect(totals.hasCPVPackages).toBe(true);
    expect(totals.totalViews).toBe(10000);
    expect(totals.totalCPVInvestment).toBe(500);
    expect(totals.overallCPV).toBe(0.05);
    expect(totals.totalImpressions).toBe(0);
    expect(totals.overallCPM).toBe(0);
  });
});

describe('calculateInvestmentCategoryBreakdown', () => {
  it('categorizes a regular package by type', () => {
    const cats = calculateInvestmentCategoryBreakdown([
      { type: 'talent', totalInvestment: 1000, totalCost: 700 }
    ]);
    expect(cats.creative.investment).toBe(1000);
    expect(cats.creative.cost).toBe(700);
    expect(cats.creative.margin).toBe(300);
    expect(cats.creative.count).toBe(1);
  });

  it('tracks Added Value talent sub-type cost separately from investment', () => {
    // Note: for addedValueType 'talent', the category's talentCost bucket
    // reads pkg.talentCost specifically (not the generic pkg.totalCost) —
    // real data sets both to the same value, as here.
    const cats = calculateInvestmentCategoryBreakdown([
      { type: 'added-value', addedValueType: 'talent', totalInvestment: 0, talentCost: 300, totalCost: 300, totalValue: 1000 }
    ]);
    expect(cats.addedvalue.value).toBe(1000);
    expect(cats.addedvalue.talentCost).toBe(300);
    expect(cats.addedvalue.investment).toBe(0);
    expect(cats.addedvalue.cost).toBe(300);
  });

  it('distributes detailed sponsorship line items into categories without incrementing count', () => {
    // Regression guard: this is the exact bug found and fixed in the Excel
    // export — sponsorship line items must land in the right category by
    // investment/cost, but must NOT increment cat.count (only whole regular
    // packages do), since count is used elsewhere to gate section visibility.
    const cats = calculateInvestmentCategoryBreakdown([
      {
        type: 'sponsorship', sponsorshipType: 'detailed',
        sponsorshipLineItems: [
          { placementType: 'PAID_MEDIA', netCost: 500, totalCost: 300, margin: 200, quantity: 10000 },
          { placementType: 'DIGITAL_OO', netCost: 200, totalCost: 100, margin: 100, quantity: 5000 }
        ]
      }
    ]);
    expect(cats.creative.investment).toBe(500);
    expect(cats.creative.cost).toBe(300);
    expect(cats.creative.impressions).toBe(10000);
    expect(cats.creative.count).toBe(0);
    expect(cats.oo.investment).toBe(200);
    expect(cats.oo.cost).toBe(100);
    expect(cats.oo.impressions).toBe(5000);
    expect(cats.oo.count).toBe(0);
  });
});

describe('categorizeSponsorshipLineItem', () => {
  it('splits CUSTOM_SOCIAL cost between talent and media per spec', () => {
    const cats = makeEmptyInvestmentBreakdownCats();
    categorizeSponsorshipLineItem(
      { placementType: 'CUSTOM_SOCIAL', netCost: 200, totalCost: 120, talentCost: 50, mediaCost: 70 },
      cats
    );
    expect(cats.talent.investment).toBe(50);
    expect(cats.talent.cost).toBe(50);
    expect(cats.media.investment).toBe(150);
    expect(cats.media.cost).toBe(70);
  });

  it('routes ADDED_VALUE sub-types to the correct bucket, cost only', () => {
    const cats = makeEmptyInvestmentBreakdownCats();
    categorizeSponsorshipLineItem({ placementType: 'ADDED_VALUE', addedValueSubType: 'talent', totalCost: 80 }, cats);
    expect(cats.talent.cost).toBe(80);
    expect(cats.talent.investment).toBe(0);
  });
});

describe('calculateFullInvestmentBreakdown', () => {
  it('splits branded-blended investment/cost between talent and media', () => {
    const cats = calculateFullInvestmentBreakdown([
      { type: 'branded-blended', talentCost: 200, totalInvestment: 1000, totalCost: 600 }
    ]);
    expect(cats.talent.investment).toBe(200);
    expect(cats.talent.cost).toBe(200);
    expect(cats.media.investment).toBe(800);
    expect(cats.media.cost).toBe(400);
  });
});

describe('getPlacementTypeLabel', () => {
  it('returns the known label for a recognized type', () => {
    expect(getPlacementTypeLabel('PAID_MEDIA')).toBe('Paid Media Distribution');
  });
  it('falls back to the raw type for an unrecognized value', () => {
    expect(getPlacementTypeLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('getPackageMetricInfo', () => {
  it('uses Views/CPV for X Amplify CPV partnerships', () => {
    const info = getPackageMetricInfo({ type: 'partnership', partnershipType: 'x_amplify', pricingMetric: 'cpv', views: 1000, cpv: 0.1 });
    expect(info.usesViews).toBe(true);
    expect(info.metricValue).toBe(1000);
    expect(info.pricingValue).toBe(0.1);
  });
  it('uses Impressions/CPM for everything else', () => {
    const info = getPackageMetricInfo({ type: 'streaming', impressions: 5000, cpm: 20 });
    expect(info.usesViews).toBe(false);
    expect(info.metricValue).toBe(5000);
    expect(info.pricingValue).toBe(20);
  });
});

describe('regression guard against real plan data', () => {
  // These values were captured from the live app (via headless-browser
  // verification) on the exact "GOLD - Version 3 - Complete" version of a
  // real exported plan, immediately after the calculation engine was
  // extracted into calculations.js — locking in that the extraction changed
  // nothing about the actual numbers.
  it('matches known-good totals for the Under Armour x VMAs 2026 "Complete" version', () => {
    const project = JSON.parse(fs.readFileSync(path.join(TEST_DATA_DIR, 'INTERNAL_under_armour_x_vmas_2026_2026-08-28.json'), 'utf8'));
    const version = project.versions.find(v => v.name === 'GOLD - Version 3 - Complete');
    const totals = calculateOverallTotals(version.packages);
    const cats = calculateInvestmentCategoryBreakdown(version.packages);
    const fullBreakdown = calculateFullInvestmentBreakdown(version.packages);

    expect(totals.totalPrice).toBe(5813718);
    expect(totals.totalCost).toBeCloseTo(2337857.14, 2);
    expect(totals.totalMarginPercent).toBeCloseTo(59.7872, 3);
    expect(cats.creative.investment).toBe(3700000);
    expect(fullBreakdown.streaming.investment).toBe(1194868);
  });
});
