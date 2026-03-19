/**
 * Seed script — inserts sample healthcare documents into MongoDB + Elasticsearch.
 * Run once to populate test data without needing real PDF uploads.
 *
 * Prerequisites:
 *   - MongoDB running on port 27017
 *   - Elasticsearch running on port 9200 (with analysis-icu plugin installed)
 *   - Embedding service running on port 8001 (cd services/embedding-service && python main.py)
 *
 * Usage:
 *   cd node-backend
 *   node scripts/seedDocs.js [username]
 *   # defaults to username "admin" if not provided
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../src/config/index.js';
import { initElasticsearch, es, CHUNK_INDEX } from '../src/utils/ragHelper/esClient.js';
import { splitTextWithOverlap, detectLanguage } from '../src/utils/ragHelper/chunker.js';
import { embedBatch } from '../src/utils/ragHelper/embeddingModel.js';
import Document from '../src/models/Document.js';

const TARGET_USER = process.argv[2] || 'admin';

// ---------------------------------------------------------------------------
// Sample healthcare documents
// ---------------------------------------------------------------------------

const DOCUMENTS = [
  {
    title: 'CHIP Program Overview — Texas',
    source: 'Texas HHS',
    category: 'eligibility-enrollment',
    content: `
CHIP — Children's Health Insurance Program

CHIP provides low-cost health coverage to children in families that earn too much to qualify for Medicaid but cannot afford private insurance. In Texas, CHIP is administered by the Health and Human Services Commission (HHSC).

ELIGIBILITY
Children from birth through age 18 may qualify if:
- They are uninsured (not currently covered by any health plan)
- They are a U.S. citizen or eligible immigrant
- They live in Texas
- Their family income is at or below 201% of the Federal Poverty Level (FPL)

Children are not eligible if they have access to employer-sponsored health coverage that the state determines is cost-effective.

ENROLLMENT FEES
CHIP charges small enrollment fees based on family income:
- Families earning 0–150% FPL: No enrollment fee
- Families earning 151–200% FPL: $50 per family per year

COPAYMENTS
Most CHIP members pay small copayments for services:
- Primary care doctor visit: $3 per visit
- Specialist visit: $5 per visit
- Emergency room (non-emergency use): $8 per visit
- Prescription drugs (generic): $3 per prescription
- Prescription drugs (brand-name): $5 per prescription
- Hospital stays: $15 per day, up to $100 per stay

There are no copayments for preventive care, mental health services, or substance use disorder treatment.

HOW TO APPLY
Families can apply for CHIP online at YourTexasBenefits.com, by phone at 2-1-1 (Texas Health and Human Services), or in person at a local benefits office.

After applying, families typically receive a decision within 30 days. Once approved, coverage begins on the first day of the following month.

BENEFITS COVERED
CHIP covers a comprehensive set of health services including:
- Doctor visits (primary care and specialist)
- Preventive care and immunizations
- Prescription drugs
- Emergency services
- Hospital care (inpatient and outpatient)
- Mental health and behavioral health services
- Dental and vision care
- Lab and X-ray services

CHIP PERINATAL
Texas also offers CHIP Perinatal, which covers unborn children of pregnant women who do not qualify for Medicaid. This program covers prenatal care, labor and delivery, and postpartum care for the mother.
`,
  },
  {
    title: 'Texas Medicaid — Eligibility and Benefits Overview',
    source: 'Texas HHS',
    category: 'eligibility-enrollment',
    content: `
TEXAS MEDICAID PROGRAM OVERVIEW

Medicaid is a joint federal-state program that provides health coverage to eligible low-income adults, children, pregnant women, elderly adults, and people with disabilities. In Texas, Medicaid is administered by the Health and Human Services Commission (HHSC).

WHO IS ELIGIBLE?
Texas Medicaid covers several groups:

1. Children
   - Ages 0–1: Up to 198% FPL
   - Ages 1–5: Up to 133% FPL
   - Ages 6–18: Up to 100% FPL

2. Pregnant Women
   - Up to 198% FPL for pregnancy-related services

3. Adults with Disabilities
   - Individuals receiving Supplemental Security Income (SSI) are automatically eligible

4. Elderly Adults (age 65+)
   - Must meet income and asset requirements
   - Long-term care services available for nursing home or home-based care

5. Parents and Caretaker Relatives
   - Very limited coverage; income limit is very low (approximately 17% FPL)

Note: Texas has not expanded Medicaid under the Affordable Care Act (ACA), so most low-income adults without children or disabilities do not qualify.

IMMIGRATION STATUS
Most qualified immigrants who have been lawfully present for 5 years or more may be eligible. Emergency Medicaid is available regardless of immigration status for emergencies.

BENEFITS
Texas Medicaid covers a wide range of services:
- Doctor visits and preventive care
- Hospital care (inpatient and outpatient)
- Emergency services
- Mental health and substance use disorder treatment
- Prescription drugs
- Dental care (for children and some adults)
- Vision care
- Long-term care services (nursing facility, home and community-based services)
- Transportation to medical appointments

MANAGED CARE
Most Texas Medicaid members receive services through managed care organizations (MCOs). Members choose a health plan, which coordinates all their health care. Plans available include STAR (for children and families) and STAR+PLUS (for adults with disabilities and elderly).

HOW TO APPLY
Apply online at YourTexasBenefits.com, call 2-1-1, or visit a local benefits office. A decision is typically made within 45 days (or 90 days if a disability determination is needed).
`,
  },
  {
    title: 'How to File a Health Insurance Complaint — Texas Department of Insurance',
    source: 'Texas Department of Insurance (TDI)',
    category: 'claims-complaints',
    content: `
FILING A HEALTH INSURANCE COMPLAINT WITH THE TEXAS DEPARTMENT OF INSURANCE

The Texas Department of Insurance (TDI) helps resolve complaints against insurance companies, HMOs, and agents licensed in Texas. Filing a complaint is free.

WHAT TDI CAN HELP WITH
- Claim denials you believe are incorrect
- Delays in claim payments
- Billing disputes with your insurance company
- Cancellation or non-renewal of your policy
- Difficulty getting your insurance company to respond
- Problems with your health plan not covering services you believe are covered

WHAT TDI CANNOT HELP WITH
- Disputes about the quality of medical care you received
- Complaints about doctors, hospitals, or other health care providers (contact HHSC or the Texas Medical Board)
- Employer-sponsored health plans governed by federal ERISA law (contact the U.S. Department of Labor)

HOW TO FILE A COMPLAINT

Step 1: Gather your information
Before filing, collect:
- Your insurance policy number
- The name of your insurance company or HMO
- Dates of service and claim numbers
- Any correspondence with your insurer
- Explanation of Benefits (EOB) statements
- Denial letters

Step 2: File online, by mail, or by phone
- Online: tdi.texas.gov/consumer/complfrm.html
- Phone: 1-800-252-3439
- Mail: Texas Department of Insurance, PO Box 149091, Austin, TX 78714-9091

Step 3: What happens next
TDI will review your complaint and contact your insurance company. The insurer has 30 days to respond. TDI will send you a written summary of their findings. If TDI finds a violation, they can order the insurer to take corrective action.

APPEALS AND EXTERNAL REVIEW
If your claim is denied:
1. First, file an internal appeal with your insurance company. You typically have 180 days to appeal.
2. If the internal appeal is denied, you may request an independent external review. Texas law gives you the right to an external review for most coverage denials.
3. External reviews are conducted by independent organizations and are binding on the insurer.

For urgent or emergency situations, you can request an expedited review, which must be completed within 72 hours.

SURPRISE BILLING PROTECTION
Texas law protects you from surprise bills from out-of-network providers at in-network facilities. If you receive a surprise bill, you may file a complaint with TDI or request an independent dispute resolution process.

CONTACTING TDI
Website: tdi.texas.gov
Consumer Help Line: 1-800-252-3439
Hours: Monday–Friday, 8 a.m. to 5 p.m. Central Time
`,
  },
  {
    title: 'Premium Tax Credits and ACA Marketplace Insurance — Overview',
    source: 'HealthCare.gov / IRS',
    category: 'taxes-credits',
    content: `
PREMIUM TAX CREDITS FOR ACA MARKETPLACE INSURANCE

The Advance Premium Tax Credit (APTC) helps lower your monthly health insurance premiums if you buy coverage through the ACA Health Insurance Marketplace (Healthcare.gov).

WHO IS ELIGIBLE?
To qualify for premium tax credits:
- You must enroll in a Marketplace health plan (not through an employer or government program)
- Your household income must be between 100% and 400% of the Federal Poverty Level (FPL)
  - Note: Through 2025, the American Rescue Plan expanded eligibility — people above 400% FPL may also qualify
- You must not be eligible for affordable employer-sponsored coverage, Medicaid, or Medicare
- You must file a federal tax return
- You must not be claimed as a dependent on someone else's return

HOW IT WORKS
When you apply through Healthcare.gov, the Marketplace estimates your income and calculates your expected premium tax credit. You can choose to:
- Apply the credit directly to your monthly premium (advance payments), reducing what you pay each month
- Take the full credit when you file your tax return

FORM 1095-A
Each year, the Marketplace sends you Form 1095-A (Health Insurance Marketplace Statement). This form shows:
- The months you had Marketplace coverage
- The amount of advance premium tax credits paid on your behalf
- The benchmark silver plan premium used to calculate your credit

You need Form 1095-A to complete Form 8962 on your tax return.

FORM 8962 — RECONCILIATION
When you file your federal tax return, you must complete Form 8962 (Premium Tax Credit) to reconcile:
- The advance credits paid during the year
- The actual credit amount you are entitled to based on your final income

If your income was LOWER than estimated: you get a larger credit and may receive a refund.
If your income was HIGHER than estimated: you may owe back some or all of the advance credits.

REPORTING INCOME CHANGES
If your income or household size changes during the year, update your information on Healthcare.gov as soon as possible. This prevents large repayment amounts at tax time.

SILVER PLAN BENCHMARK
The premium tax credit is calculated based on the second-lowest-cost silver plan available in your area. If you choose a more expensive plan, you pay the difference. If you choose a less expensive plan, the remaining credit is not refunded.

ENROLLMENT PERIODS
- Open Enrollment: November 1 – January 15 (in Texas)
- Special Enrollment Period: triggered by life events (job loss, marriage, having a baby, moving)
`,
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Seeding documents for user: ${TARGET_USER}`);

  // Connect MongoDB
  await mongoose.connect(config.mongo.uri, { dbName: config.mongo.dbName });
  console.log('MongoDB connected');

  // Init Elasticsearch
  const esReady = await initElasticsearch();
  if (!esReady) {
    console.error('Elasticsearch not available — aborting');
    process.exit(1);
  }

  for (const doc of DOCUMENTS) {
    const docId = uuidv4();
    const text = doc.content.trim();
    const chunks = splitTextWithOverlap(text);
    const docLanguage = detectLanguage(text);

    console.log(`\nIngesting: "${doc.title}" — ${chunks.length} chunks`);

    const vectors = await embedBatch(chunks.map(c => c.content));

    const operations = chunks.flatMap((chunk, idx) => [
      { index: { _index: CHUNK_INDEX } },
      {
        doc_id:      docId,
        user_name:   TARGET_USER,
        chunk_index: idx,
        content:     chunk.content,
        content_en:  chunk.language !== 'zh' ? chunk.content : '',
        content_zh:  chunk.language !== 'en' ? chunk.content : '',
        embedding:   vectors[idx],
        title:       doc.title,
        source:      doc.source,
        category:    doc.category,
        language:    chunk.language,
      },
    ]);

    await es.bulk({ operations, refresh: true });

    await new Document({
      id:         docId,
      user_name:  TARGET_USER,
      filename:   `${doc.title}.txt`,
      file_path:  'seeded',
      title:      doc.title,
      source:     doc.source,
      category:   doc.category,
      language:   docLanguage,
      created_at: new Date(),
    }).save();

    console.log(`  ✓ Saved "${doc.title}" (id: ${docId})`);
  }

  console.log('\nSeeding complete.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});