// Shared calculation engine — used by index.html (as a plain <script> include,
// defining these as globals) and by the new app / test suite (as a CommonJS
// import). Moving code here, not rewriting it, is the point: this is the
// exact logic that previously lived inline in index.html.

function getPackageMetricInfo(pkg) {
    const usesViews = pkg.type === 'partnership' &&
                      pkg.partnershipType === 'x_amplify' &&
                      pkg.pricingMetric === 'cpv';

    // Get impressions value based on package type
    let impressionsValue;
    if (pkg.type === 'sponsorship' && pkg.sponsorshipType === 'detailed') {
        impressionsValue = pkg.totalImpressions || 0;
    } else {
        impressionsValue = pkg.impressions || 0;
    }

    // Get CPM value based on package type
    let cpmValue;
    if (pkg.type === 'sponsorship' && pkg.sponsorshipType === 'detailed') {
        cpmValue = pkg.overallCPM || 0;
    } else {
        cpmValue = pkg.cpm || pkg.packageCPM || 0;
    }

    return {
        usesViews: usesViews,
        metricLabel: usesViews ? 'Views' : 'Impressions',
        metricValue: usesViews ? (pkg.views || 0) : impressionsValue,
        pricingLabel: usesViews ? 'CPV' : 'CPM',
        pricingValue: usesViews ? (pkg.cpv || 0) : cpmValue
    };
}

function calculateInvestmentCategoryBreakdown(packages) {
    const feeTypesNoFees = ['INTEGRATION_FEE', 'EXPERIENTIAL_FEE', 'IP_LICENSING'];
    const categories = {
        creative: {
            types: ['influencer', 'branded', 'branded-blended', 'talent', 'media', 'fees', 'partnership'],
            label: 'Creative',
            investment: 0, cost: 0, margin: 0, impressions: 0, talentCost: 0, mediaCost: 0, count: 0,
            investmentNoFees: 0, costNoFees: 0, marginNoFees: 0
        },
        oo: {
            types: ['streaming', 'linear'],
            label: 'O&O',
            investment: 0, cost: 0, margin: 0, impressions: 0, talentCost: 0, mediaCost: 0, count: 0
        },
        addedvalue: {
            types: ['added-value'],
            label: 'Added Value',
            investment: 0, cost: 0, margin: 0, impressions: 0, talentCost: 0, mediaCost: 0, mediaCPM: 0, value: 0, count: 0
        },
        brandfunded: {
            types: ['brand-funded-content'],
            label: 'Brand Funded Content',
            investment: 0, cost: 0, margin: 0, impressions: 0, count: 0
        }
    };

    packages.forEach(pkg => {
        // Detailed Sponsorship packages distribute their line items into
        // the categories individually, rather than counting the package
        // as a single unit.
        if (pkg.type === 'sponsorship' && pkg.sponsorshipType === 'detailed' && pkg.sponsorshipLineItems) {
            pkg.sponsorshipLineItems.forEach(item => {
                const placementType = item.placementType;
                let targetCategory = null;

                if (['TALENT_PRODUCTION', 'PAID_MEDIA', 'CUSTOM_SOCIAL', 'SOCIAL_VIDEO',
                     'EXPERIENTIAL_FEE', 'EXPERIENTIAL_BUILDOUT', 'INTEGRATION_FEE', 'INTEGRATION_BUILDOUT', 'IP_LICENSING'].includes(placementType)) {
                    targetCategory = categories.creative;
                } else if (['DIGITAL_OO', 'ADD_INNOVATION', 'LINEAR_OO'].includes(placementType)) {
                    targetCategory = categories.oo;
                } else if (placementType === 'ADDED_VALUE') {
                    targetCategory = categories.addedvalue;
                }

                if (targetCategory) {
                    targetCategory.investment += item.netCost || 0;
                    targetCategory.cost += item.totalCost || 0;
                    targetCategory.margin += (item.margin || 0);
                    targetCategory.impressions += (item.quantity || 0);

                    if (targetCategory === categories.creative && !feeTypesNoFees.includes(placementType)) {
                        targetCategory.investmentNoFees += item.netCost || 0;
                        targetCategory.costNoFees += item.totalCost || 0;
                        targetCategory.marginNoFees += (item.margin || 0);
                    }

                    if (placementType === 'ADDED_VALUE') {
                        targetCategory.value += (item.netCost || 0);
                    }
                }
            });
        } else {
            // Regular package handling
            for (const [key, cat] of Object.entries(categories)) {
                if (cat.types.includes(pkg.type)) {
                    cat.count++;
                    cat.investment += pkg.totalInvestment;
                    cat.cost += (pkg.totalCost || 0);
                    cat.margin += (pkg.totalInvestment - (pkg.totalCost || 0));

                    if (key === 'creative' && pkg.type !== 'fees') {
                        cat.investmentNoFees += pkg.totalInvestment;
                        cat.costNoFees += (pkg.totalCost || 0);
                        cat.marginNoFees += (pkg.totalInvestment - (pkg.totalCost || 0));
                    }

                    if (pkg.type === 'added-value') {
                        cat.value += (pkg.totalValue || 0);
                        if (pkg.addedValueType === 'talent') {
                            cat.talentCost += (pkg.talentCost || 0);
                            // Talent-type Added Value has no impressions
                        } else {
                            // Distribution and Streaming
                            cat.mediaCost += (pkg.totalCost || 0);
                            cat.impressions += (pkg.impressions || 0);
                        }
                    } else if (['streaming', 'partnership', 'branded-blended'].includes(pkg.type)) {
                        cat.impressions += (pkg.impressions || 0);
                    } else {
                        cat.impressions += (pkg.totalImpressions || 0);
                    }
                    break;
                }
            }
        }
    });

    return categories;
}

function categorizeSponsorshipLineItem(item, cats) {
    const type = item.placementType;
    const netCost = item.netCost || 0;
    const totalCost = item.totalCost || 0;

    if (['TALENT_PRODUCTION', 'EXPERIENTIAL_BUILDOUT', 'INTEGRATION_BUILDOUT'].includes(type)) {
        cats.talent.investment += netCost;
        cats.talent.cost += totalCost;
    } else if (type === 'PAID_MEDIA') {
        cats.media.investment += netCost;
        cats.media.cost += totalCost;
    } else if (type === 'CUSTOM_SOCIAL') {
        // Per spec: Production & Talent Investment = Production & Talent Cost;
        // Media Investment = Total Investment - Production & Talent
        const talentCost = item.talentCost || 0;
        const mediaCost = item.mediaCost || 0;
        cats.talent.investment += talentCost;
        cats.talent.cost += talentCost;
        cats.media.investment += (netCost - talentCost);
        cats.media.cost += mediaCost;
    } else if (['DIGITAL_OO', 'ADD_INNOVATION'].includes(type)) {
        cats.streaming.investment += netCost;
    } else if (type === 'LINEAR_OO') {
        cats.linear.investment += netCost;
    } else if (type === 'SOCIAL_VIDEO') {
        cats.social.investment += netCost;
        cats.social.cost += totalCost;
    } else if (['EXPERIENTIAL_FEE', 'INTEGRATION_FEE', 'IP_LICENSING'].includes(type)) {
        cats.fees.investment += netCost;
    } else if (type === 'BRAND_FUNDED_CONTENT') {
        cats.brandFunded.investment += netCost;
        cats.brandFunded.cost += totalCost;
    } else if (type === 'ADDED_VALUE') {
        if (item.addedValueSubType === 'talent') {
            cats.talent.cost += totalCost;
        } else if (item.addedValueSubType === 'distribution') {
            cats.media.cost += totalCost;
        }
        // 'streaming' / 'other' / unset: no clear mapping, excluded
    }
}

function makeEmptyInvestmentBreakdownCats() {
    return {
        talent: { label: 'Production & Talent', investment: 0, cost: 0, hasCost: true },
        media: { label: 'Paid Media', investment: 0, cost: 0, hasCost: true },
        social: { label: 'Social Partnership', investment: 0, cost: 0, hasCost: true },
        streaming: { label: 'Streaming', investment: 0, cost: 0, hasCost: false },
        linear: { label: 'Linear', investment: 0, cost: 0, hasCost: false },
        fees: { label: 'Fees', investment: 0, cost: 0, hasCost: false },
        brandFunded: { label: 'Brand Funded Content', investment: 0, cost: 0, hasCost: true },
        addedValue: { label: 'Added Value', investment: 0, cost: 0, hasCost: true }
    };
}

// Computes the version-level "Overall Totals" block (Total Investment,
// Impressions/Views, CPM/CPV, Cost, Margin) for a given array of
// packages. This is the single source of truth for that block —
// previously independently duplicated across the main screen, the
// View Summary overlay, the PDF export, and the Excel export, with
// the PDF export's copy having drifted out of sync (missing the
// CPV/CPM separation fix, and deriving Media Cost differently).
function calculateOverallTotals(packages) {
    // Added Value packages represent bonus/no-charge value given to
    // the client — they carry a cost to provide, but that cost isn't
    // tied to anything actually sold, so it shouldn't drag down the
    // margin math for the rest of the deal. Everything below that
    // feeds Total Investment / Total Cost / Total Margin excludes
    // them; their cost and notional value are tracked separately
    // instead, never blended in.
    const nonAddedValuePackages = packages.filter(pkg => pkg.type !== 'added-value');
    const addedValuePackages = packages.filter(pkg => pkg.type === 'added-value');

    const totalPrice = nonAddedValuePackages.reduce((sum, pkg) => sum + pkg.totalInvestment, 0);

    // Separate CPV packages from CPM packages
    const hasCPVPackages = packages.some(pkg =>
        pkg.type === 'partnership' &&
        pkg.partnershipType === 'x_amplify' &&
        pkg.pricingMetric === 'cpv'
    );

    let totalViews = 0;
    let totalCPVInvestment = 0;
    let totalImpressions = 0;
    let totalCPMInvestment = 0;

    packages.forEach(pkg => {
        const metricInfo = getPackageMetricInfo(pkg);

        if (metricInfo.usesViews) {
            // CPV package - count views
            totalViews += (pkg.views || 0);
            totalCPVInvestment += pkg.totalInvestment;
        } else {
            // CPM package - count impressions
            if (pkg.type === 'sponsorship' && pkg.sponsorshipType === 'detailed') {
                // Detailed sponsorships use totalImpressions field
                totalImpressions += (pkg.totalImpressions || 0);
            } else if (['streaming', 'partnership', 'branded-blended', 'added-value'].includes(pkg.type)) {
                totalImpressions += (pkg.impressions || 0);
            } else {
                totalImpressions += (pkg.totalImpressions || 0);
            }
            totalCPMInvestment += pkg.totalInvestment;
        }
    });

    const totalCost = nonAddedValuePackages.reduce((sum, pkg) => sum + (pkg.totalCost || 0), 0);
    const totalTalentCost = nonAddedValuePackages.reduce((sum, pkg) => sum + (pkg.talentCost || 0), 0);
    const totalMediaCost = nonAddedValuePackages.reduce((sum, pkg) => sum + (pkg.mediaCost || 0), 0);
    const totalMarginDollar = totalPrice - totalCost;
    const totalMarginPercent = (totalPrice > 0) ? (totalMarginDollar / totalPrice) * 100 : 0;

    // Added Value's own cost and notional value, tracked separately —
    // never blended into totalCost/totalMarginDollar/totalMarginPercent above.
    const addedValueCost = addedValuePackages.reduce((sum, pkg) => sum + (pkg.totalCost || 0), 0);
    const addedValueValue = addedValuePackages.reduce((sum, pkg) => sum + (pkg.totalValue || 0), 0);

    // Calculate CPM only from non-CPV packages
    const overallCPM = (totalImpressions > 0 && totalCPMInvestment > 0)
        ? (totalCPMInvestment / totalImpressions * 1000)
        : 0;

    // Calculate CPV from CPV packages
    const overallCPV = (totalViews > 0 && totalCPVInvestment > 0)
        ? (totalCPVInvestment / totalViews)
        : 0;

    return {
        totalPrice, hasCPVPackages, totalViews, totalCPVInvestment,
        totalImpressions, totalCPMInvestment, totalCost,
        totalTalentCost, totalMediaCost, totalMarginDollar, totalMarginPercent,
        addedValueCost, addedValueValue,
        overallCPM, overallCPV
    };
}

// Computes the full 7-category Investment Breakdown (Production &
// Talent / Paid Media / Social Partnership / Streaming / Linear /
// Fees / Brand Funded Content) for a given array of packages,
// including distributing Detailed Sponsorship line items correctly.
// This is the same categorization logic used by the Investment
// Breakdown tab, PDF export, and Excel export — extracted here as one
// reusable function for the Closed Deals export, rather than writing
// a fourth independent copy of it.
function calculateFullInvestmentBreakdown(packages) {
    const cats = makeEmptyInvestmentBreakdownCats();
    (packages || []).forEach(pkg => {
        if (pkg.type === 'sponsorship') {
            if (pkg.sponsorshipType === 'detailed' && pkg.sponsorshipLineItems) {
                pkg.sponsorshipLineItems.forEach(item => categorizeSponsorshipLineItem(item, cats));
            }
            return;
        }
        if (['influencer', 'branded', 'talent', 'media'].includes(pkg.type)) {
            cats.talent.investment += (pkg.talentInvestment || 0);
            cats.talent.cost += (pkg.talentCost || 0);
            cats.media.investment += (pkg.mediaInvestmentDollar || 0);
            const mediaCost = (pkg.platformAllocations && pkg.platformAllocations.length > 0)
                ? pkg.platformAllocations.reduce((s, a) => s + (a.totalCost || 0), 0)
                : Math.max(0, (pkg.totalCost || 0) - (pkg.talentCost || 0));
            cats.media.cost += mediaCost;
        } else if (pkg.type === 'branded-blended') {
            const talentCost = pkg.talentCost || 0;
            cats.talent.investment += talentCost;
            cats.talent.cost += talentCost;
            cats.media.investment += (pkg.totalInvestment || 0) - talentCost;
            cats.media.cost += (pkg.totalCost || 0) - talentCost;
        } else if (pkg.type === 'partnership') {
            // Optional Production & Talent Cost (added on top of rev-share
            // cost) contributes to Production & Talent; the balance of
            // investment/cost stays in Social Partnership — same
            // Investment = Cost convention used for Branded-Blended,
            // since partnerships don't natively track a separate
            // "talent investment" figure.
            const partnershipTalentCost = pkg.talentCost || 0;
            cats.talent.investment += partnershipTalentCost;
            cats.talent.cost += partnershipTalentCost;
            cats.social.investment += (pkg.totalInvestment || 0) - partnershipTalentCost;
            cats.social.cost += (pkg.mediaCost || 0);
        } else if (pkg.type === 'streaming') {
            cats.streaming.investment += (pkg.totalInvestment || 0);
        } else if (pkg.type === 'linear') {
            cats.linear.investment += (pkg.totalInvestment || 0);
        } else if (pkg.type === 'fees') {
            cats.fees.investment += (pkg.totalInvestment || 0);
        } else if (pkg.type === 'brand-funded-content') {
            cats.brandFunded.investment += (pkg.totalInvestment || 0);
            cats.brandFunded.cost += (pkg.totalCost || 0);
        } else if (pkg.type === 'added-value') {
            // Added Value now gets its own explicit category, rather
            // than being folded into Production & Talent / Paid Media
            // based on its sub-type — this money represents bonus
            // value given to the client, not a paid placement, so it
            // shouldn't be mixed into either of those "real" categories.
            cats.addedValue.investment += (pkg.totalInvestment || 0);
            cats.addedValue.cost += (pkg.totalCost || 0);
        }
    });
    return cats;
}

function getPlacementTypeLabel(type) {
    const labels = {
        'TALENT_PRODUCTION': 'Talent and Production',
        'PAID_MEDIA': 'Paid Media Distribution',
        'CUSTOM_SOCIAL': 'Custom Social Package',
        'DIGITAL_OO': 'Digital O&O',
        'ADD_INNOVATION': 'Ad Innovation',
        'ADDED_VALUE': 'Added Value',
        'SOCIAL_VIDEO': 'Social Video',
        'LINEAR_OO': 'Linear O&O',
        'EXPERIENTIAL_FEE': 'Experiential – Fee',
        'EXPERIENTIAL_BUILDOUT': 'Experiential Production Buildout',
        'INTEGRATION_FEE': 'Integration – Fee',
        'INTEGRATION_BUILDOUT': 'Integration Production Buildout',
        'IP_LICENSING': 'IP / Licensing - Fee',
        'BRAND_FUNDED_CONTENT': 'Brand Funded Content'
    };
    return labels[type] || type;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getPackageMetricInfo,
        calculateInvestmentCategoryBreakdown,
        categorizeSponsorshipLineItem,
        makeEmptyInvestmentBreakdownCats,
        calculateOverallTotals,
        calculateFullInvestmentBreakdown,
        getPlacementTypeLabel
    };
}
