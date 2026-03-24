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
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const TARGET_USER = process.argv[2] || 'admin';

// ---------------------------------------------------------------------------
// Sample healthcare documents — extended to ~13,000+ chars each (~10 chunks)
// so that Recall@5 is a meaningful metric (5 out of 10+ chunks ≠ ceiling).
// ---------------------------------------------------------------------------

const DOCUMENTS = [
  {
    title: 'CHIP Program Overview — Texas',
    source: 'Texas HHS',
    category: 'eligibility-enrollment',
    content: `
CHIP — Children's Health Insurance Program

PROGRAM OVERVIEW AND BASIC ELIGIBILITY
CHIP provides low-cost health coverage to children in families that earn too much income to qualify for Medicaid but cannot afford private insurance. In Texas, CHIP is administered by the Health and Human Services Commission (HHSC). The program is a joint federal-state initiative — Texas receives federal matching funds and sets eligibility rules within federal guidelines. CHIP covers preventive care, doctor visits, prescription drugs, dental, vision, hospital stays, and mental health services, all at minimal cost to families.

WHO QUALIFIES
A child is eligible for CHIP if all of the following apply:
- The child is age 18 or under at the time of application.
- The child is currently uninsured (not covered by any employer, private, or government health plan).
- The child is a U.S. citizen or qualifying immigrant (see immigration section).
- The child lives in Texas.
- The household's annual income is at or below 201% of the Federal Poverty Level (FPL).

Children are not eligible for CHIP if: (1) they qualify for Medicaid, (2) they have access to cost-effective employer-sponsored health coverage, or (3) they are enrolled in any other comprehensive health plan.

MEDICAID VS. CHIP INCOME THRESHOLDS
CHIP begins where Medicaid ends. Texas Medicaid covers children by age: infants (0–1) up to 198% FPL; children ages 1–5 up to 133% FPL; ages 6–18 up to 100% FPL. CHIP then covers children above these Medicaid limits up to 201% FPL. Applications for both programs are submitted through the same system (YourTexasBenefits.com); if a child is found Medicaid-eligible, they are enrolled in Medicaid instead of CHIP. CHIP and Medicaid together form a seamless coverage continuum for low- and moderate-income Texas children.


IMMIGRATION STATUS AND CHIP ELIGIBILITY

Lawfully Residing Children
Texas CHIP covers children who are "lawfully residing" in the United States — a standard broader than what applies to adult Medicaid applicants. Qualifying immigration statuses include:
- Lawful permanent residents (green card holders, Form I-551)
- Refugees and asylees granted protection by the U.S. government
- Persons paroled into the United States for at least one year
- Persons granted withholding of deportation or removal by an immigration judge
- Conditional entrants admitted before April 1, 1980
- Children of active-duty armed forces members with qualifying status
- T-visa holders (victims of severe forms of trafficking)
- U-visa holders (victims of certain crimes who assist law enforcement)
- Individuals under Deferred Action for Childhood Arrivals (DACA) — check current rules

No Five-Year Waiting Period for Children
Unlike Medicaid for certain immigrant adult categories, Texas does not impose the standard five-year waiting period for children applying to CHIP or CHIP-funded Medicaid. Eligible immigrant children may apply immediately upon establishing qualifying immigration status and Texas residency.

Undocumented Children
Children without legal immigration status are not eligible for CHIP or regular Medicaid. However, Emergency Medicaid is available for treatment of acute emergency medical conditions regardless of immigration status. CHIP Perinatal is available for pregnant women (including those who are undocumented) to cover the unborn child's prenatal care.

Required Documentation
Families must provide proof of immigration status when applying. Acceptable documents include: green card (Form I-551), employment authorization card (Form I-766), refugee travel document, asylum approval letter, or immigration court orders. HHSC verifies status through federal systems (SAVE — Systematic Alien Verification for Entitlements). Documentation requirements are the same whether applying online, by phone, or in person.


ENROLLMENT FEES AND COPAYMENT SCHEDULE

Annual Enrollment Fees
CHIP charges annual enrollment fees per family, based on household income as a percentage of the FPL:
- Families earning 0–150% FPL: No enrollment fee
- Families earning 151–200% FPL: $50 per family per year

The fee covers the entire family — there is no additional per-child charge. Fees must be paid before coverage begins. Families may request a hardship waiver by contacting HHSC.

Copayment Schedule
Members pay small copayments at the time of service. Preventive care, mental health services, and immunizations have no copayments.

Service                                   Copayment
Primary care physician visit              $3
Specialist visit                          $5
Emergency room (non-emergency use)        $8
Urgent care center                        $5
Generic prescription drug                 $3 per fill
Brand-name prescription drug             $5 per fill
Hospital inpatient stay                   $15/day, max $100 per stay
Dental visit (restorative only)           $5
Mental health / behavioral health         $0
Substance use disorder treatment          $0
Immunizations and vaccines                $0
Annual well-child preventive exam         $0
Vision exam                               $0
Prenatal care visits (CHIP Perinatal)     $0

Annual Out-of-Pocket Maximum
Federal law caps total annual cost-sharing for CHIP families at 5% of household income. Once a family's cumulative copayments and enrollment fees reach this limit, no further copayments are due for the rest of the benefit year. HHSC and health plans track copayments automatically.

Cost Comparison to Private Insurance
CHIP is far less expensive than comparable private coverage. A family of four at 175% FPL pays only the $50 annual enrollment fee. An equivalent unsubsidized marketplace plan for the same family would cost $350–$700 per month in premiums plus a $3,000–$6,000 annual deductible. CHIP provides near-comprehensive coverage with minimal out-of-pocket costs.


COVERED BENEFITS — PREVENTIVE AND MEDICAL CARE

Preventive and Primary Care
CHIP provides a comprehensive benefit package mandated by federal law:
- Annual well-child exams (EPSDT — Early and Periodic Screening, Diagnostic, and Treatment)
- All recommended childhood immunizations and catch-up vaccines per the CDC immunization schedule
- Developmental and behavioral screenings at well-child visits
- Lead screening for children under age 6
- Vision screening at preventive exams; full eye exam once per year
- Hearing screening and audiological evaluations
- Nutrition counseling; obesity and body-mass-index (BMI) screening

Medical and Specialty Services
- Primary care physician visits (unlimited, $3 copay)
- Specialist visits with managed care plan coordination ($5 copay)
- Emergency room care for true emergencies (24 hours a day, 7 days a week)
- Urgent care centers for non-emergency acute illness or injury
- Inpatient hospital care for illness, injury, surgery, childbirth, and mental health crises
- Outpatient surgery and same-day surgical procedures
- Laboratory tests, blood panels, and diagnostic imaging (X-ray, CT, MRI, ultrasound)
- Physical therapy, occupational therapy, and speech-language pathology
- Durable medical equipment (wheelchairs, walkers, hearing aids, nebulizers, blood glucose monitors)
- Prosthetics and orthotics
- Home health services when medically necessary

Differences from Private Insurance
Unlike many employer-sponsored plans, CHIP has no annual or lifetime benefit maximum, no deductible, and covers dental and vision as standard benefits. Private plans often treat dental and vision as expensive add-on premiums and impose deductibles of $1,000–$5,000 before major coverage begins.


COVERED BENEFITS — DENTAL, VISION, BEHAVIORAL HEALTH, AND PRESCRIPTIONS

Dental Care
CHIP covers both preventive and restorative dental services:
- Preventive: professional cleanings (two per year), fluoride treatments, dental sealants on molars, X-rays
- Restorative: fillings (amalgam and composite), tooth extractions, crowns for primary and permanent teeth
- Orthodontic care for children with severe malocclusion causing functional impairment — prior authorization required; cosmetic orthodontics are not covered
CHIP does not cover purely cosmetic dental procedures or teeth whitening.

Vision Care
- One complete comprehensive eye exam per year
- Eyeglasses: one pair of frames per year (plan allowance typically $75–$100); lenses covered in full
- Contact lenses: covered only when medically necessary (e.g., severe astigmatism, keratoconus, or following eye surgery); routine contact lenses for cosmetic preference are not covered
- Referral to ophthalmology for conditions such as amblyopia, strabismus, glaucoma

Mental Health and Behavioral Health Services
- Individual, group, and family outpatient therapy sessions (no copay)
- Psychiatric evaluations and medication management visits (no copay)
- Inpatient psychiatric hospitalization when medically necessary
- Substance use disorder (SUD) treatment: medically managed detoxification, intensive outpatient programs (IOP), residential treatment, and outpatient counseling
- Applied Behavior Analysis (ABA) therapy for children with a confirmed Autism Spectrum Disorder (ASD) diagnosis — prior authorization required; typically 20–40 hours per week

Prescription Drugs
- All medications listed on the CHIP formulary (preferred drug list)
- Generic drugs: $3 copay; brand-name: $5 copay
- Specialty drugs (e.g., biologics, oncology agents) require prior authorization
- Mail-order pharmacy available for maintenance medications (90-day supply at 2× standard copay)
- Specialty pharmacy for complex medications requiring special handling or monitoring

Additional Benefits
- Non-emergency medical transportation to covered appointments
- Interpreter and translation services (free, available in 100+ languages)
- Telehealth visits for eligible services (same copay as in-person)


HOW TO APPLY FOR CHIP — STEP-BY-STEP GUIDE

Step 1: Choose Your Application Channel
Families may apply for CHIP through four channels:

A. Online — YourTexasBenefits.com
Available 24/7 in English and Spanish. The online portal allows families to upload required documents, check application status, and manage their case. Document upload (PDF, JPG, PNG) accepted for most supporting materials.

B. Phone — Call 2-1-1
The Texas Health and Human Services helpline is available Monday–Friday, 8 a.m. to 6 p.m. Central time. Language interpretation is available for over 100 languages at no cost. Staff can complete the application over the phone and advise on required documents.

C. In Person — HHSC Benefits Office
Families can apply in person at any local HHSC office. Bring all original documents. Office locations are available at hhs.texas.gov/office-locator. Walk-ins are accepted; appointments are recommended to reduce wait times.

D. Mail — Paper Application
Download or request a paper form from YourTexasBenefits.com or by calling 2-1-1. Mail the completed application with copies (not originals) of supporting documents to the HHSC address printed on the form.

Step 2: Required Documents
Before applying, gather:
- Each child's birth certificate or hospital birth record (proof of age and identity)
- Proof of Texas residency: utility bill, lease agreement, or school enrollment letter dated within the past 60 days
- Proof of household income for all adults: two most recent pay stubs; or prior-year W-2 and tax return; or self-employment ledger
- Social Security numbers for all household members (if available — not required for every member)
- Proof of current immigration status for non-citizen household members
- Documentation of any current health insurance coverage and monthly premium amounts

Step 3: HHSC Review and Decision
HHSC issues a written determination within 30 calendar days for most applications. Cases requiring disability documentation may take up to 90 days. Families receive an approval or denial notice by mail; denial notices include the specific reason and instructions for appealing. Applicants can check status at YourTexasBenefits.com or by calling 2-1-1.


AFTER APPROVAL — PLAN SELECTION AND ENROLLMENT

Choosing a CHIP Health Plan
Upon approval, families must choose a CHIP-participating managed care organization (MCO) in their region. Texas offers several MCO plans per region; plan availability varies by county. Families should compare plans based on:
- Provider network: verify that the child's current pediatrician and specialists are in-network
- Formulary: confirm that the child's ongoing medications are covered without restrictions
- Plan performance ratings and member satisfaction scores (available on the Texas HHSC website)
- Locations of in-network hospitals, urgent care centers, and specialty clinics

Families must select a plan within 15 days of the approval notice. If no selection is made, HHSC auto-assigns a plan based on the family's location and the child's prior care history.

Choosing a Primary Care Provider (PCP)
Each covered child must have a designated primary care provider within the selected MCO network. The PCP coordinates all routine and specialist care. Families can select a PCP during plan enrollment by searching the MCO's online provider directory or calling the plan's member services line. Most CHIP plans allow PCP changes once per month without requiring a reason; additional changes may require documentation of a qualifying circumstance (such as the PCP leaving the network, or relocation).

First Month of Coverage
CHIP coverage begins on the first day of the month following approval. Insurance cards arrive by mail within 5–7 business days of plan selection. For emergency care needed before the card arrives, families may present the CHIP approval letter at any participating provider. Members may verify their plan and PCP information by logging in to their MCO's member portal.


CHIP PERINATAL PROGRAM

What Is CHIP Perinatal?
CHIP Perinatal is a Texas program that covers unborn children of pregnant women who do not qualify for regular Medicaid. The program technically provides coverage for the unborn child, not the mother, allowing it to serve women who would otherwise be ineligible for state-funded coverage (including undocumented women). Coverage includes prenatal care, labor and delivery, and postpartum services.

Eligibility Requirements for CHIP Perinatal
A pregnant woman may enroll her unborn child in CHIP Perinatal if:
- She is currently pregnant.
- She lives in Texas.
- She does not qualify for full-scope Medicaid (including because she is undocumented).
- Her household income is at or below 201% FPL.
There is no citizenship or immigration status requirement for the pregnant woman — CHIP Perinatal is specifically designed to reach uninsured immigrant women.

Services Covered Under CHIP Perinatal
- Regular prenatal care visits throughout pregnancy (OB/GYN or certified nurse-midwife)
- Ultrasounds and other pregnancy-related diagnostic imaging
- Prenatal laboratory tests (blood type, glucose tolerance, Group B strep screening, etc.)
- Nutritional counseling and WIC coordination
- Labor and delivery — vaginal and cesarean birth (facility fees and provider fees)
- Postpartum care for up to 60 days following delivery
- Treatment of complications of pregnancy (gestational diabetes, preeclampsia, etc.)
- Prescription drugs related to the pregnancy (prenatal vitamins, insulin, antihypertensives)

Coverage Limitations for the Mother
CHIP Perinatal covers only pregnancy-related services. It does not provide general health care for the mother. Dental care, vision, mental health not related to the pregnancy, and other routine services are not covered under CHIP Perinatal.

After Delivery
At birth, the newborn automatically receives 12 months of Medicaid coverage regardless of the mother's immigration or income status — this is called "Newborn Medicaid." The mother is disenrolled from CHIP Perinatal unless she independently qualifies for Medicaid. Families should contact HHSC within 30 days of the birth to register the newborn.

How to Apply
Apply through the same channels as regular CHIP: YourTexasBenefits.com, call 2-1-1, or visit an HHSC office. Applicants should specify that they are applying for CHIP Perinatal. Processing is typically faster for CHIP Perinatal (within 15 business days) to ensure timely coverage during pregnancy.


CHIP ANNUAL RENEWAL AND REPORTING CHANGES

Annual Renewal (Redetermination)
CHIP coverage lasts for 12 months. Approximately 60–90 days before the renewal date, HHSC mails a renewal packet to the address on file. Families must complete the renewal to maintain coverage. Options:
- Online at YourTexasBenefits.com
- By phone: call 2-1-1
- By mail: complete and return the enclosed renewal form
- In person: visit any HHSC office

HHSC may auto-renew a case using data from other state systems (income records, other program databases) if the family does not respond and auto-renewal data confirms continued eligibility. Families who miss their renewal deadline have a 90-day grace period during which they can complete renewal without losing their enrollment history.

Changes That Must Be Reported
Families must report the following changes within 10 days:
- Changes in household income: new employment, job loss, raise, pay cut, or loss of other income
- Changes in household size: birth of a child, marriage, divorce, a member moving in or out
- Change of Texas address (moving to another state requires disenrollment from Texas CHIP)
- Obtaining access to employer-sponsored health coverage (makes the child potentially ineligible)
- Change in citizenship or immigration status

Failure to report changes may result in overpayment recovery, loss of future eligibility, or a referral for fraud investigation.

Renewing Texas Children's Health Insurance — Process and Timeline
Renewal notices include a pre-populated form with the family's current information. Families should review for accuracy and update any changed information. If income has increased above 201% FPL, the family may be disenrolled; they should explore ACA marketplace plans with premium tax credits. If income has dropped below the Medicaid threshold, families should report the change so that HHSC can transfer coverage to Medicaid without a gap.

Switching Health Plans at Renewal
During the annual renewal window, families may switch their CHIP health plan. Outside of renewal, plan changes require a qualifying reason (moving out of the service area, loss of PCP from network, or documented quality-of-care concerns documented in writing).


CHIP APPEALS, GRIEVANCES, AND COMPLAINTS

Right to Appeal
If CHIP denies, terminates, or reduces coverage for a child, the family has the right to appeal the decision. The denial notice will state the specific reason and the deadline to appeal (typically 90 days from the notice date). Families should file an appeal as promptly as possible.

Types of Disputes
Grievances: Complaints about the quality of care received, difficulty accessing services, or dissatisfaction with how the health plan handled a request. Grievances are filed directly with the CHIP health plan.
Appeals (Internal): Formal challenges to a health plan's decision to deny, reduce, or terminate a specific covered service. The plan must respond within 30 days (or 72 hours for urgent situations).
State Fair Hearing: If the health plan denies the internal appeal, the family may request a State Fair Hearing before an independent administrative law judge through HHSC. The judge's ruling is binding on the health plan.

How to File an Internal Appeal
Step 1: Submit a written appeal to the CHIP health plan within 30–90 days of the adverse decision (check your plan's timeframe). Include a copy of the denial notice and any supporting medical documentation.
Step 2: The plan must acknowledge receipt within 5 business days and issue a decision within 30 days (or 72 hours for expedited reviews in urgent medical situations).
Step 3: If the plan upholds the denial, request a State Fair Hearing by contacting HHSC at 1-800-735-2989 (TTY) or online at YourTexasBenefits.com. Families have the right to continue receiving the disputed benefits while the appeal is pending (except for termination of coverage due to loss of eligibility).

Contact Information for Assistance
- HHSC Benefits Helpline: 2-1-1 or 1-877-541-7905
- HHSC Fair and Fraud Hearings: 1-800-735-2989
- Texas Department of Insurance (for disputes with insurance companies): 1-800-252-3439
`,
  },
  {
    title: 'Texas Medicaid — Eligibility and Benefits Overview',
    source: 'Texas HHS',
    category: 'eligibility-enrollment',
    content: `
TEXAS MEDICAID PROGRAM OVERVIEW

What Is Medicaid?
Medicaid is a joint federal-state program that provides health coverage to eligible low-income individuals and families. In Texas, Medicaid is administered by the Health and Human Services Commission (HHSC). The federal government sets minimum eligibility standards and benefits requirements; Texas sets additional state-specific rules within those federal guidelines and receives matching federal funds for qualifying expenditures. Texas Medicaid is distinct from Medicaid in other states because Texas has not expanded Medicaid under the Affordable Care Act (ACA), which means most low-income adults without children or qualifying disabilities remain ineligible for Medicaid in Texas.

Texas Medicaid vs. Federal Medicaid (ACA Expansion)
Under the ACA, states may expand Medicaid to cover adults with incomes up to 138% FPL regardless of other circumstances. As of 2026, Texas has not adopted ACA Medicaid expansion. This means that in Texas, unlike in 41 other states, most adults (ages 19–64) without dependent children, a qualifying disability, or pregnancy do not qualify for Medicaid — regardless of how low their income is. Low-income childless adults in Texas who do not qualify for Medicaid may instead pursue ACA marketplace insurance with premium tax credits.

Texas Medicaid covers the following mandatory and optional eligibility groups:
- Children (various income thresholds by age)
- Pregnant women (up to 198% FPL for pregnancy-related services)
- Adults with qualifying disabilities receiving SSI
- Elderly adults (age 65+) meeting income and asset tests
- Parents and caretaker relatives of dependent children (very limited income threshold)
- Foster care youth and former foster care youth (up to age 26)


MEDICAID ELIGIBILITY — CHILDREN AND PREGNANT WOMEN

Children's Income Thresholds
Texas Medicaid covers children based on age and household income:
- Infants (birth through age 1): up to 198% of the Federal Poverty Level (FPL)
- Children ages 1–5: up to 133% FPL
- Children ages 6–18: up to 100% FPL

Children who exceed these income limits may qualify for CHIP (Children's Health Insurance Program), which covers households up to 201% FPL.

Pregnant Women
Pregnant women may qualify for Texas Medicaid if their household income is at or below 198% FPL. Coverage for pregnant women includes pregnancy-related services, labor and delivery, and postpartum care for 60 days following delivery. Pregnant women who are undocumented do not qualify for regular Medicaid but may enroll their unborn child in CHIP Perinatal for prenatal and delivery coverage.

Foster Care and Former Foster Care Youth
Children in Texas foster care receive full Medicaid coverage through the Texas STAR Health program. Former foster care youth who aged out of the system continue to receive Medicaid coverage until age 26, regardless of income — this is a federal mandate.

Income and Asset Rules
Medicaid uses the Modified Adjusted Gross Income (MAGI) methodology for most eligibility groups. Countable household income includes wages, salaries, self-employment income, Social Security benefits, and certain other income. For the elderly and disabled categories, both income AND asset limits apply (asset tests are not used for children and pregnant women).


MEDICAID ELIGIBILITY — ADULTS WITH DISABILITIES, ELDERLY, AND PARENTS

Adults with Disabilities
Individuals who receive Supplemental Security Income (SSI) from the Social Security Administration are automatically eligible for Texas Medicaid. SSI recipients do not need to apply separately for Medicaid — enrollment is automatic upon SSI approval. Individuals who have a disability but do not receive SSI may apply for Medicaid through HHSC; HHSC conducts a disability determination review (which may take up to 90 days).

Medicaid covers a broad range of services for adults with disabilities, including long-term care (nursing facilities and home-based alternatives), personal attendant services, specialized therapies, and adaptive equipment. Adults with disabilities who qualify for both Medicaid and Medicare (known as "dual eligible" individuals) receive coverage from both programs with Medicaid covering most cost-sharing.

Elderly Adults (Age 65+)
Adults aged 65 and older may qualify for Medicaid if their income and assets meet the program's limits. Income limits for elderly individuals vary based on the level of care needed. Elderly Medicaid recipients often receive nursing facility care or home- and community-based services (HCBS) through Medicaid waiver programs. Medicare-eligible individuals may receive Medicaid assistance with Medicare premiums, deductibles, and copayments through Medicare Savings Programs.

Parents and Caretaker Relatives
Texas Medicaid covers parents and caretaker relatives of dependent children, but the income threshold is extremely low — approximately 17% of the Federal Poverty Level for a family of three. Very few working parents qualify. This gap (adults earning 17–138% FPL) is the coverage gap that Medicaid expansion would address; in Texas, these individuals have limited coverage options.


MEDICAID IMMIGRATION AND RESIDENCY REQUIREMENTS

Immigration Status
Medicaid eligibility for non-citizens depends on their immigration category:
- Qualified immigrants (lawful permanent residents, refugees, asylees, certain others) who have been in the U.S. for at least 5 years are eligible for full Medicaid if they meet all other criteria.
- Qualified immigrants who have been in the U.S. for less than 5 years may receive Emergency Medicaid only (for acute emergencies).
- Children and pregnant women who are lawfully residing (a broader category than "qualified immigrants") may be exempt from the 5-year waiting period under state CHIP and CHIP-funded Medicaid programs.
- Undocumented immigrants are eligible only for Emergency Medicaid.

Emergency Medicaid
Emergency Medicaid covers the cost of emergency medical treatment for individuals who meet all Medicaid eligibility criteria except immigration status. Emergency Medicaid pays for emergency room care, emergency surgery, emergency hospitalization, and labor and delivery for undocumented pregnant women. It does not cover follow-up care, routine treatment, or preventive services.

Texas Residency
Applicants must be current Texas residents with the intent to remain in Texas. Individuals must physically reside in Texas (not just maintain a legal address). There is no minimum residency duration requirement — individuals who move to Texas and immediately need Medicaid may apply.


MEDICAID BENEFITS — MEDICAL AND HOSPITAL SERVICES

Mandatory Benefits (Required by Federal Law)
Texas Medicaid must cover:
- Inpatient hospital services (room, board, and hospital-based physician services)
- Outpatient hospital services (same-day procedures, emergency visits, outpatient clinics)
- Physician services (primary care, specialists, obstetric care, pediatric care)
- Early and Periodic Screening, Diagnostic, and Treatment (EPSDT) for children under 21
- Nursing facility services for eligible adults
- Home health services
- Family planning services and supplies
- Federally Qualified Health Center (FQHC) and Rural Health Clinic services
- Transportation to medical appointments

Optional Benefits Covered by Texas
Texas also covers the following optional Medicaid services:
- Prescription drugs (through a formulary with prior authorization for some medications)
- Dental services (preventive for children under EPSDT; limited for adults)
- Vision services (eyeglasses for children under EPSDT; limited for adults)
- Physical therapy, occupational therapy, and speech-language pathology
- Chiropractic services (limited)
- Hospice care
- Intermediate care facilities for individuals with intellectual disabilities (ICF/IID)
- Personal care services for adults who qualify

Services Not Covered
Medicaid does not cover cosmetic procedures, fertility treatments beyond medically necessary diagnostic work, experimental treatments not approved by the FDA, or services not determined to be medically necessary by the managed care plan.


MEDICAID BENEFITS — LONG-TERM CARE AND DISABILITY SERVICES

Nursing Facility Care
Texas Medicaid covers nursing facility (nursing home) care for eligible elderly and disabled adults who require 24-hour skilled nursing or custodial care. To qualify, individuals must meet functional eligibility (needing help with activities of daily living) in addition to financial eligibility. Nursing facility residents generally must contribute most of their income toward the cost of care, with Medicaid covering the remainder.

Home- and Community-Based Services (HCBS)
Texas operates several Medicaid waiver programs that provide services in the community instead of a nursing facility:
- STAR+PLUS Home and Community-Based Services (HCBS): personal attendant services, homemaker services, adult day care, emergency response systems, respite care, and minor home modifications for adults aged 21 and older with disabilities or chronic conditions
- Community Living Assistance and Support Services (CLASS): for individuals with related conditions (e.g., traumatic brain injury)
- Deaf-Blind with Multiple Disabilities (DBMD): specialized services for qualifying individuals
- Home and Community-based Services (HCS): for individuals with intellectual disabilities

STAR+PLUS Program
STAR+PLUS is the managed care program for Medicaid recipients who are adults with disabilities and elderly adults (ages 21+). STAR+PLUS coordinates medical care, behavioral health, and long-term services through a single managed care organization (MCO). Members choose a STAR+PLUS health plan and receive all covered services through that plan. STAR+PLUS covers everything in the standard Medicaid benefit package plus the community-based long-term services described above.


MANAGED CARE — STAR, STAR+PLUS, AND STAR HEALTH

STAR Program (for Children and Families)
Most Texas Medicaid recipients who are children and families receive care through the STAR (State of Texas Access Reform) program, which is the standard managed care model. Under STAR:
- Members choose a health plan (MCO) from those available in their service area
- The MCO coordinates all health care, including primary care, specialist visits, hospital care, and behavioral health
- Members have a designated primary care provider (PCP) who manages routine and preventive care and provides referrals to specialists
- The MCO is responsible for the full package of covered Medicaid benefits

STAR covers children (birth through age 18 who are not in foster care), pregnant women, and certain parents and caretaker relatives.

STAR+PLUS (for Adults with Disabilities and Elderly)
STAR+PLUS covers Medicaid recipients who are adults with disabilities (21+) and elderly adults. In addition to the standard Medicaid benefit package, STAR+PLUS provides:
- Long-term services and supports (LTSS): personal attendant care, homemaker services, adult day care, emergency response systems
- Behavioral health services fully integrated with physical health care
- Care management: a dedicated care coordinator helps members navigate complex needs

Choosing a Health Plan and Primary Care Provider
Upon Medicaid approval, members in managed care areas select an MCO plan. To change your Medicaid primary care provider (PCP):
1. Log in to your MCO's member portal or call the MCO's member services line (printed on your insurance card).
2. Request a PCP change — most plans allow one free change per month.
3. The new PCP becomes effective the first day of the following month (or immediately if the current PCP is unavailable or has left the network).
4. For urgent PCP changes (e.g., your PCP has retired), the plan may process the change immediately.

STAR Health (Foster Care)
STAR Health is a specialized managed care program for children and youth in Texas foster care. It is administered by a single statewide MCO and provides enhanced services including trauma-informed care coordination, expanded behavioral health services, and comprehensive health passports that travel with the child as their placement changes.


HOW TO APPLY FOR MEDICAID AND CHECK YOUR STATUS

Applying for Texas Medicaid
Applications are accepted through the following channels:
- Online: YourTexasBenefits.com (available in English and Spanish; 24/7 access)
- Phone: Call 2-1-1 (Texas HHS helpline); Monday–Friday, 8 a.m.–6 p.m. Central
- In person: Visit any HHSC benefits office; locations at hhs.texas.gov/office-locator
- Mail: Request a paper application from 2-1-1 and mail with supporting documents

Processing times: Most applications are processed within 45 calendar days. Applications requiring a disability determination may take up to 90 days.

Checking Your Medicaid Application Status
After applying, you can check the status of your application by:
1. Logging into YourTexasBenefits.com with your account credentials. The "My Cases" section displays current application status and any required documents outstanding.
2. Calling 2-1-1 and asking a representative for a case status update. Have your case number (from your application confirmation) available.
3. Visiting an HHSC office in person with your case number.

Required Documents for Medicaid Application
- Proof of identity (driver's license, state ID, passport, birth certificate)
- Proof of Texas residency (utility bill, lease, school enrollment letter within 60 days)
- Proof of income for all household members (pay stubs, tax returns, benefit award letters)
- Social Security numbers for all applying family members
- Proof of immigration status for non-citizen applicants
- Medical records or disability documentation (for disability-based applications)

Renewing Medicaid
Medicaid coverage is reviewed annually. HHSC mails a renewal packet 60–90 days before the review date. Complete the renewal online, by phone, or by mail. If you do not respond, HHSC will attempt to auto-renew using available data. Always report changes in income, household size, or address within 10 days to avoid overpayment recovery.


MEDICAID APPEALS, FAIR HEARINGS, AND GRIEVANCES

Right to a State Fair Hearing
If Texas Medicaid denies, reduces, or terminates your benefits, or if your managed care plan denies a service, you have the right to a State Fair Hearing before an independent administrative law judge. The denial notice will state the reason and the deadline for requesting a hearing (usually 90 days from the notice date).

How to Request a Fair Hearing
- Online: YourTexasBenefits.com → "Request a Fair Hearing"
- Phone: 1-800-735-2989 (TTY) or HHSC's main line at 2-1-1
- Mail: Write to the HHSC Fair and Fraud Hearings division (address on denial notice)

Continuation of Benefits During Appeal
If you request a fair hearing before the effective date of a proposed reduction or termination, you typically have the right to continue receiving benefits at the current level while the hearing is pending. If you lose the hearing, you may be required to repay benefits received during the appeal period.

Health Plan Grievances
Complaints about service quality, access, or plan conduct are filed as grievances directly with your MCO. The plan must acknowledge receipt within 5 business days and resolve the grievance within 30 days. If you are not satisfied with the MCO's grievance response, you may escalate to HHSC or file a complaint with the Texas Department of Insurance (for licensed insurance plans).
`,
  },
  {
    title: 'How to File a Health Insurance Complaint — Texas Department of Insurance',
    source: 'Texas Department of Insurance (TDI)',
    category: 'claims-complaints',
    content: `
FILING A HEALTH INSURANCE COMPLAINT WITH THE TEXAS DEPARTMENT OF INSURANCE

Overview of TDI's Role
The Texas Department of Insurance (TDI) is the state agency responsible for regulating insurance companies, health maintenance organizations (HMOs), and insurance agents licensed to operate in Texas. TDI protects consumers by ensuring that insurers comply with Texas insurance laws and that claims are handled fairly and promptly. Filing a complaint with TDI is free, and TDI staff work with both consumers and insurers to resolve disputes.

What TDI Can Help With
TDI accepts complaints involving:
- Claim denials that the consumer believes are incorrect or not properly explained
- Unreasonable delays in claim payment beyond 15 business days (the required timeline under Texas law)
- Billing disputes with the insurance company (not with the provider directly)
- Unexpected cancellation or non-renewal of a health insurance policy
- Failure of an insurance company to respond to a consumer's written inquiry
- Disputes about whether a service should be covered under the policy
- Problems with HMO authorizations or referrals
- Agent misconduct or misrepresentation when selling a policy
- Premium overcharges or unauthorized premium changes

TDI's authority extends to state-regulated health insurance plans — individual and small-group marketplace plans, state-regulated HMOs, short-term health plans, and other products licensed by TDI. All complaints filed with TDI become part of the insurer's public complaint record, which TDI uses in market conduct examinations and licensing decisions.


WHAT TDI CANNOT HELP WITH

Disputes Outside TDI Jurisdiction
TDI cannot resolve all health insurance disputes. Understanding TDI's limits helps consumers find the right agency for their issue:

Medical Malpractice and Quality of Care
TDI cannot adjudicate complaints about the quality of medical care received, clinical decisions made by providers, or alleged medical malpractice. These disputes are handled by:
- The Texas Medical Board (for complaints against physicians): tmb.state.tx.us
- The Texas Board of Nursing (for complaints against nurses): bon.texas.gov
- HHSC's Health Care Quality Section (for hospital complaints): hhs.texas.gov

ERISA Self-Funded Employer Plans
If your health insurance is provided through a large employer and the plan is "self-funded" (the employer, not an insurance company, bears the risk of claims), the plan is governed by ERISA — a federal law — and is not regulated by TDI. Self-funded plan disputes are handled by:
- The U.S. Department of Labor, Employee Benefits Security Administration (EBSA)
- EBSA hotline: 1-866-444-3272
- Website: dol.gov/agencies/ebsa

Medicare
Medicare complaints are handled by the Centers for Medicare and Medicaid Services (CMS), not TDI:
- Medicare Advantage plan complaints: 1-800-MEDICARE (1-800-633-4227)
- Medicare Part D prescription complaints: CMS or the plan's own appeals process

Medicaid
Medicaid disputes are handled by HHSC, not TDI. Contact 2-1-1 for Medicaid appeals.

How to Know If Your Plan Is Self-Funded
Ask your employer's HR department whether the health plan is "self-funded" or "fully insured." Alternatively, look at your plan documents — ERISA-governed plans will include a Statement of ERISA Rights. If you cannot determine this, TDI can help identify whether your plan falls under its jurisdiction.


HOW TO FILE A COMPLAINT — STEP 1: GATHER YOUR INFORMATION

Before Filing, Collect These Documents
Filing a complete and organized complaint helps TDI investigate more quickly. Gather the following before starting:

Insurance Policy Information
- Your insurance policy number (on your insurance card or on billing statements)
- The name of your insurance company or HMO (full legal name, not a trade name)
- The name of the plan or product (e.g., "Blue Choice PPO Plan 500")
- Your group number (if you have employer coverage)
- Effective dates of your coverage

Claim and Service Information
- Dates of service for the claim in dispute
- Name and address of the health care provider (doctor, hospital, facility)
- Claim number(s) as assigned by the insurance company
- Procedure codes (CPT codes) from the Explanation of Benefits (EOB) or claim statement
- Diagnosis codes (ICD codes) if available

Correspondence and Denial Documentation
- Copies of all written correspondence with your insurance company related to the claim
- All Explanation of Benefits (EOB) statements received for the disputed claim
- The denial letter with the specific reason for denial and any appeal instructions
- Any prior authorization requests you submitted and the responses received
- Letters from your treating physician supporting medical necessity (if applicable)

Timeline Documentation
- Dates you received services, submitted the claim, received EOBs, and received denial letters
- Records of phone calls to the insurance company (date, time, representative's name if known, what was discussed)

Organizing your documents in chronological order before filing will speed the process significantly.


HOW TO FILE A COMPLAINT — STEPS 2 AND 3: SUBMIT AND TRACK

Step 2: Submit Your Complaint to TDI

Online (Recommended)
File at: tdi.texas.gov/consumer/complfrm.html
The online form is available 24/7 and allows you to upload supporting documents directly. You will receive a confirmation number immediately upon submission. Online filing is the fastest way to reach TDI and track your complaint.

By Phone
TDI Consumer Help Line: 1-800-252-3439
Hours: Monday–Friday, 8 a.m. to 5 p.m. Central Time
Phone staff can take your complaint information verbally, but may ask you to mail or upload supporting documents separately.

By Mail
Texas Department of Insurance
P.O. Box 149091
Austin, TX 78714-9091
Include copies (not originals) of all supporting documents with your written complaint. Clearly write your name, address, and policy number on each page.

Step 3: What Happens After Filing

TDI Review
After receiving your complaint, TDI sends a copy of your complaint to the insurance company and requests a written response. The insurer has 30 days to respond. TDI reviews both the consumer's complaint and the insurer's response against the applicable Texas insurance laws and regulations.

Communication During the Process
TDI will send you written acknowledgment of your complaint within a few business days. You will receive a written summary of TDI's findings at the conclusion of the investigation, typically within 45–90 days of filing, depending on complexity.

Possible Outcomes
- TDI may determine the insurer handled the claim correctly and explain why.
- TDI may find that the insurer violated Texas insurance law and order corrective action (reprocessing the claim, paying benefits owed, issuing a refund, or disciplinary action against the insurer).
- TDI cannot order medical treatment or override clinical decisions, but it can require proper application of policy benefits.


INTERNAL APPEALS PROCESS

Your Right to Appeal a Claim Denial
Before or instead of filing a complaint with TDI, you have the right to appeal a claim denial directly to your insurance company. Internal appeals are often faster than regulatory complaints and are a required first step before requesting external review.

Internal Appeal Timelines
- Standard appeal: You have at least 180 days from receiving the denial notice to file an internal appeal.
- Urgent/expedited appeal: If your health is at serious risk and waiting 30 days for a decision would be detrimental, you may request an expedited appeal. The insurer must decide within 72 hours.

How to File an Internal Appeal
Step 1: Submit a written appeal to the insurance company's appeals department (address on the EOB or denial letter). Include:
  - A copy of the denial letter
  - A written explanation of why you believe the denial is incorrect
  - Supporting documentation: medical records, treating physician's letter supporting medical necessity, peer-reviewed literature, clinical guidelines
Step 2: The insurance company must acknowledge receipt of your appeal in writing within a reasonable time (typically 5 business days) and issue a final decision within 30 days for standard appeals or 72 hours for urgent appeals.
Step 3: If the internal appeal is denied, you will receive a written final adverse benefit determination. This document is required for requesting external review.

Appealing a Prior Authorization Denial
If a prior authorization was denied before you received treatment, the same appeals process applies. You may request a peer-to-peer review — a conversation between your treating physician and the insurer's medical director — which sometimes resolves prior authorization disputes without a formal appeal.


EXTERNAL INDEPENDENT REVIEW

Your Right to External Review
If your insurance company upholds the denial after the internal appeal, you have the right to an independent external review under Texas law and the ACA. External review is conducted by an independent review organization (IRO) with no financial relationship with your insurer. The IRO's decision is binding on the insurance company.

Which Denials Qualify for External Review
External review is available for:
- Medical necessity denials (the insurer says the treatment isn't medically necessary)
- Experimental or investigational treatment denials
- Clinical decisions made by the insurer (not administrative denials like failure to pay premiums)
- Rescission (cancellation of coverage retroactively)

External review is NOT available for:
- Eligibility disputes (whether you are eligible for the plan)
- Disputes about plan terms or benefit definitions that do not involve clinical judgment
- ERISA self-funded employer plan disputes (handled federally)

How to Request External Review
- File within 4 months of receiving the final adverse benefit determination.
- Submit a request to your insurer (who must arrange the IRO) or directly to TDI.
- TDI maintains a list of certified IROs in Texas.
- There is no cost to you for requesting external review.

Timeline and Decision
The IRO must decide within 45 days (standard) or 72 hours (expedited). The decision is delivered in writing to both you and your insurer. If the IRO rules in your favor, the insurer must provide the coverage. If the IRO upholds the denial, the decision is final and cannot be appealed further through the external review process (though you may still pursue legal remedies).


EXPEDITED REVIEW FOR URGENT MEDICAL SITUATIONS

When Expedited Review Applies
Expedited (or urgent) review applies when waiting for a standard decision timeline (30 days for internal appeal, 45 days for external review) could seriously jeopardize your health, life, or ability to regain maximum function. Examples include:
- Denials for hospitalizations currently in progress
- Denials for ongoing chemotherapy or radiation therapy
- Denials for medications needed to prevent immediate health deterioration
- Situations where a physician certifies that waiting would cause significant clinical harm

Expedited Internal Appeal
The insurer must decide an expedited internal appeal within 72 hours of receiving the request. You may request both an internal and external expedited review simultaneously in urgent situations.

Expedited External Review
The IRO must decide an expedited external review within 72 hours of receiving a completed request. The insurer must implement the IRO's decision immediately if it rules in the consumer's favor.

How to Request Expedited Review
- Call the insurer's member services number (on your insurance card) and state that you need an "expedited appeal" or "urgent review."
- Submit a written request with a physician statement that the situation is urgent.
- If the insurer refuses to treat it as expedited, call TDI's Consumer Help Line at 1-800-252-3439 and explain the urgency.


SURPRISE BILLING PROTECTIONS

What Is Surprise Billing?
A surprise bill occurs when you receive care at an in-network facility (such as an in-network hospital) but some providers involved in your care — such as anesthesiologists, radiologists, or emergency room physicians — are out-of-network. Previously, those out-of-network providers could bill patients for the difference between their charges and what the insurer paid. Texas and federal law now prohibit this practice.

Texas Surprise Billing Law (TAHCA)
The Texas Health Care Transparency Act and subsequent legislation protect Texans from surprise medical bills. Under Texas law:
- You cannot be billed more than your in-network cost-sharing (deductible, copay, coinsurance) for care received at in-network facilities, even if the treating provider is out-of-network.
- You must receive written notice of your out-of-network cost estimate before receiving non-emergency out-of-network care (with limited exceptions for emergencies).
- Out-of-network providers must work directly with your insurer through an independent dispute resolution (IDR) process — they cannot balance-bill you.

No Surprise Act (Federal Law, Effective January 2022)
The federal No Surprises Act extends protections nationally, covering most group health plans and individual health plans. The law prohibits surprise billing for emergency services and for scheduled non-emergency care at in-network facilities where you did not have a meaningful choice of provider. Under the No Surprises Act:
- Your cost-sharing for out-of-network emergency care is limited to your in-network amount.
- You must receive an advance Explanation of Benefits (AEOB) for scheduled services.
- Independent Dispute Resolution (IDR): when your insurer and the provider cannot agree on payment, they must use a federal IDR process — consumers are not involved.

If You Receive a Surprise Bill
If you receive a surprise bill that you believe violates Texas or federal law:
1. Contact your insurance company and ask them to apply the surprise billing protections.
2. File a complaint with TDI at tdi.texas.gov or 1-800-252-3439.
3. For federal No Surprises Act violations, file a complaint with the U.S. Department of Health and Human Services (HHS) at cms.gov/nosurprises.


MEDIATION, HMO GRIEVANCES, AND ADDITIONAL RESOURCES

Mediation for Certain Disputes
Texas law allows consumers to request mediation for certain insurance disputes — specifically, out-of-network facility and physician claims above $500 that are paid at the in-network rate (i.e., underpayment disputes). Mediation is a voluntary, non-binding process in which a neutral mediator helps both parties reach a resolution.

Who Can Request Mediation
Either the consumer or the provider (not the insurer) may initiate mediation. Mediation is available for:
- Individual and small-group insurance plans (not ERISA self-funded plans)
- Claims that have been processed by the insurer but at lower amounts than the provider requested

HMO Grievances
If your coverage is through a Health Maintenance Organization (HMO), you have additional rights under the Texas HMO Act. HMOs must maintain a grievance process that allows members to complain about denial of care, access issues, and quality of service. HMO complaints not resolved through the internal grievance process may be brought to TDI for review.

Self-Funded ERISA Plans — Federal Resources
If your employer's plan is self-funded and therefore not regulated by TDI, contact:
- EBSA (Employee Benefits Security Administration): dol.gov/agencies/ebsa or 1-866-444-3272
- If your employer is a federal government employer: Office of Personnel Management (OPM)

Additional Consumer Resources
- TDI Consumer Help Line: 1-800-252-3439 (Monday–Friday, 8 a.m.–5 p.m.)
- TDI website: tdi.texas.gov (online complaint forms, insurer complaint ratios, agent license lookup)
- Texas Attorney General's Consumer Protection Division: oag.texas.gov/consumer (for insurance fraud)
- Center for Medicare Advocacy: medicareadvocacy.org (for Medicare-related issues)
- State Health Insurance Assistance Program (SHIP): free counseling for Medicare beneficiaries
`,
  },
  {
    title: 'Premium Tax Credits and ACA Marketplace Insurance — Overview',
    source: 'HealthCare.gov / IRS',
    category: 'taxes-credits',
    content: `
PREMIUM TAX CREDITS AND COST-SHARING REDUCTIONS — ACA MARKETPLACE INSURANCE

Overview: Two Types of Financial Assistance
The Affordable Care Act (ACA) provides two distinct types of financial assistance to help people afford Marketplace health insurance. Understanding the difference is essential for choosing the right plan:

1. Advance Premium Tax Credits (APTC) — reduce your monthly premium payment. The credit is calculated based on your estimated annual income and is paid directly to your insurance company on your behalf. You reconcile the actual credit on your federal tax return using Form 8962.

2. Cost-Sharing Reductions (CSR) — reduce your out-of-pocket costs (deductibles, copayments, and coinsurance) when you use health care services. CSR is only available on Silver-tier plans. CSR is not a tax credit — it directly reduces what you pay when you visit a doctor or hospital.

Both APTC and CSR are available only through the ACA Health Insurance Marketplace (Healthcare.gov for Texas residents), not for plans purchased outside the Marketplace, through employers, or through Medicare or Medicaid.

WHO QUALIFIES FOR PREMIUM TAX CREDITS (APTC)
To be eligible for premium tax credits:
- You must enroll in a Marketplace (Healthcare.gov) health plan.
- Your household income must be between 100% and 400% of the Federal Poverty Level (FPL). Note: under the American Rescue Plan Act (ARPA), extended through 2025 and potentially beyond, people above 400% FPL may also qualify if their benchmark premium exceeds a percentage threshold of their income.
- You must not be eligible for affordable employer-sponsored coverage, Medicaid, Medicare, CHIP, or other qualifying government coverage.
- You must file a federal tax return (married individuals must generally file jointly).
- You must not be claimed as a dependent on someone else's return.

Income Thresholds for 2026 (approximate; thresholds adjust annually with FPL updates)
- 100% FPL (individual): approximately $15,060/year
- 200% FPL (individual): approximately $30,120/year
- 400% FPL (individual): approximately $60,240/year
At 200% FPL, a family of four would have an annual income of approximately $62,400. Premium tax credits apply on a sliding scale — as income increases, the credit decreases.

Comparing Marketplace Plans vs. Medicaid
If your income is below the Medicaid threshold (in Texas: below 100% FPL for most adults without children or disability), you likely do not qualify for Marketplace premium tax credits. In Texas (which has not expanded Medicaid), adults earning less than 100% FPL may fall into the "coverage gap" — too high for Medicaid but too low for Marketplace credits. Immigrants who are lawfully present but ineligible for Medicaid may qualify for Marketplace credits even below 100% FPL.


HOW APTC WORKS — ADVANCE PAYMENTS AND ANNUAL RECONCILIATION

Calculating the Credit at Enrollment
When you apply through Healthcare.gov, the Marketplace uses your estimated annual household income to calculate your premium tax credit. The credit is based on the difference between:
- The benchmark premium: the cost of the second-lowest-cost Silver plan available in your area
- Your expected contribution: a percentage of your income you are expected to pay toward health insurance (under ARPA, this ranges from 0% to 8.5% of income depending on income level)

Your APTC = Benchmark Premium − Your Expected Contribution

Example: If the benchmark Silver plan costs $450/month and your expected contribution is $150/month, your APTC is $300/month. You can apply this $300/month credit to any Marketplace plan, not just the benchmark Silver plan.

Applying the Credit
You have two options for how to use your APTC:
Option A: Advance payments — the Marketplace sends the credit amount directly to your insurance company each month, and you pay only the net premium (your share after the credit).
Option B: Annual credit — pay the full premium yourself each month and claim the full credit on your tax return as a refundable tax credit (Form 8962). This option avoids year-end repayment risk but requires paying full premiums throughout the year.

Most people choose advance payments to reduce monthly premium costs.

Form 1095-A — Health Insurance Marketplace Statement
Each January, Healthcare.gov sends Form 1095-A to everyone who had Marketplace coverage during the prior year. Form 1095-A shows:
- The months you had Marketplace coverage
- The monthly premium for your plan
- The monthly premium for the benchmark Silver plan in your area
- The amount of advance premium tax credits paid to your insurer on your behalf

You need Form 1095-A to complete IRS Form 8962. If you do not receive Form 1095-A by early February, log in to Healthcare.gov to download it.


FORM 8962 — RECONCILIATION AND TAX RETURN REQUIREMENTS

What Is Reconciliation?
At tax time, you must reconcile the advance credits received during the year against the credit amount you are actually entitled to based on your final income. This is done on IRS Form 8962 (Premium Tax Credit), which is filed with your federal income tax return (Form 1040).

Why Reconciliation Matters
Your advance credits were calculated based on your estimated income at enrollment. If your actual income differs, there will be a discrepancy:
- If your final income is LOWER than estimated → you are entitled to more credit than you received. The difference is added to your tax refund.
- If your final income is HIGHER than estimated → you received more credit than you were entitled to. You must repay the excess.

Repayment Caps
To protect lower-income taxpayers from large repayments, the ACA imposes repayment caps based on income:
- Below 200% FPL: repayment capped at $350 (individual) or $700 (family) — 2025 figures; amounts adjust annually
- 200–300% FPL: capped at $875 (individual) or $1,750 (family)
- 300–400% FPL: capped at $1,400 (individual) or $2,800 (family)
- Above 400% FPL (no ARPA extension): no cap; full repayment required

People who received advance credits but earned above 400% FPL must repay the entire excess credit, with no cap.

Filing Requirements
- You MUST file a federal tax return if you received advance premium tax credits, even if you would not otherwise be required to file.
- Failure to file reconciliation may result in loss of future advance credits and tax penalties.
- If you are married, you generally must file jointly to claim premium tax credits.


REPORTING INCOME CHANGES AND MID-YEAR UPDATES

Why Reporting Changes Promptly Matters
Your advance credit is recalculated when you report income changes through Healthcare.gov. Reporting promptly prevents large year-end repayment amounts or under-utilization of credits you are entitled to.

Changes That Affect Your Credit
Report the following changes at Healthcare.gov as soon as they occur:
- Income changes: new job, job loss, raise or pay cut, starting or stopping self-employment, retirement
- Household size changes: marriage, divorce, birth of a child, death of a household member
- Access to employer-sponsored coverage: if you or a family member gains access to affordable employer insurance, you may become ineligible for Marketplace credits
- Changes in Medicaid or Medicare eligibility

How to Report Changes
Log in to your Healthcare.gov account and update your application. The Marketplace will recalculate your advance credit amount and adjust future payments to your insurer. The change typically takes effect the first day of the following month.

Estimated Income Uncertainty
Many people, especially self-employed individuals and those with variable income, struggle to estimate annual income accurately. Strategies to reduce repayment risk:
- Report actual monthly income rather than projecting a full-year estimate
- Use "income from last year" as a baseline and update when income significantly changes
- Consider claiming a smaller advance credit than you are eligible for, paying more upfront, and collecting the remainder as a refund at tax time


OPEN ENROLLMENT — DATES AND ELIGIBILITY

Annual Open Enrollment Period
You can enroll in or change a Marketplace health plan during the annual Open Enrollment Period:
- In Texas: November 1 through January 15 (coverage beginning February 1 for enrollments after December 15)
- December 15 is the deadline for coverage starting January 1
- Coverage enrolled between December 16 and January 15 starts February 1

Outside of Open Enrollment
You cannot enroll in a Marketplace plan outside of Open Enrollment unless you qualify for a Special Enrollment Period (see next section). If you miss Open Enrollment, you must wait until the next Open Enrollment Period unless a qualifying life event occurs.

Comparison Shopping During Open Enrollment
Healthcare.gov displays all available plans by metal tier, premium cost, deductible, and estimated total annual costs. Use the plan comparison tool to evaluate:
- Monthly premium (after APTC): what you pay each month
- Annual deductible: what you pay out of pocket before most benefits kick in
- Out-of-pocket maximum: the most you will pay in a year for covered services
- Provider network: confirm your doctors and hospital are in-network
- Formulary: confirm your prescriptions are covered at the tier you need


SPECIAL ENROLLMENT PERIODS — QUALIFYING LIFE EVENTS

What Is a Special Enrollment Period?
A Special Enrollment Period (SEP) is a window of time outside of Open Enrollment during which you are permitted to enroll in or change a Marketplace health plan. SEPs are triggered by qualifying life events — significant changes in circumstances that affect your coverage status. The typical SEP window is 60 days following the qualifying event.

Qualifying Life Events for Marketplace SEPs
Loss of Coverage
- Loss of job-based health coverage (including COBRA expiration)
- Loss of Medicaid or CHIP coverage (if determined ineligible at renewal)
- Loss of student health coverage due to graduation
- Aging off a parent's plan at age 26

Household Changes
- Marriage
- Divorce or legal separation (and loss of coverage as a result)
- Birth, adoption, or placement of a foster child
- Death of a dependent that reduces household size (and affects eligibility)

Relocation
- Moving to a new state or new coverage area where your current plan is not available
- Moving to or from a location that qualifies for or loses marketplace plan access

Other Qualifying Events
- Gaining U.S. citizenship or lawful immigration status
- Release from incarceration
- Becoming eligible for Medicaid or CHIP (enroll immediately; no SEP window required)
- Native Americans and Alaska Natives: may enroll or change plans once per month

How to Apply During a Special Enrollment Period
Log in to Healthcare.gov and select "Report a life change." Upload documentation of the qualifying event. Documentation examples:
- Job loss: employer notice of coverage termination, COBRA election notice
- Marriage: marriage certificate
- Birth: birth certificate or hospital birth record
- Move: lease agreement, utility bill, driver's license with new address


COST-SHARING REDUCTIONS (CSR) — WHO QUALIFIES AND HOW IT WORKS

What Are Cost-Sharing Reductions?
Cost-Sharing Reductions (CSR) are a separate form of ACA financial assistance that reduce out-of-pocket costs — deductibles, copayments, coinsurance, and out-of-pocket maximums — when you use health care services. CSR is NOT the same as APTC (which reduces monthly premiums).

Key Rule: CSR Is Only Available on Silver Plans
To receive cost-sharing reductions, you must enroll in a Silver-tier plan. You cannot receive CSR if you enroll in a Bronze, Gold, or Platinum plan, even if you would otherwise qualify for CSR. This is why CSR-eligible consumers are advised to shop Silver plans rather than automatically choosing Bronze plans for the lowest premium.

Who Qualifies for CSR
- Your household income must be between 100% and 250% of the FPL.
- You must be enrolled in a Silver Marketplace plan.
- The same eligibility rules apply as for APTC (no access to other qualifying government coverage).

Three CSR Income Tiers (approximate 2026 values):
- 100–150% FPL: Actuarial value increases from 70% (standard Silver) to 94% — equivalent to the most generous Platinum plan
- 150–200% FPL: Actuarial value increases to 87% — equivalent to a Gold plan
- 200–250% FPL: Actuarial value increases to 73%

In practice, a Silver plan with CSR at 100–150% FPL might have a $75 deductible and $1,500 out-of-pocket maximum, compared to a standard Silver plan with a $3,500 deductible and $7,000 out-of-pocket maximum.

Difference Between APTC and CSR
- APTC: reduces monthly premium payments; available for incomes 100–400%+ FPL; can be applied to any metal tier plan
- CSR: reduces deductibles, copays, and coinsurance; available only for incomes 100–250% FPL; requires Silver plan enrollment
- A consumer at 180% FPL may receive both APTC (to reduce their monthly premium) and CSR (to reduce their cost-sharing when they use health care) — by enrolling in a Silver plan.


PLAN METAL TIERS AND THE SILVER BENCHMARK

The Four Metal Tiers
ACA Marketplace plans are organized into four metal tiers based on their actuarial value (how much the plan pays vs. what you pay on average):
- Bronze: 60% actuarial value — lowest premium, highest out-of-pocket costs (best for people who rarely use health care)
- Silver: 70% actuarial value (higher with CSR) — moderate premium and cost-sharing; only tier eligible for CSR
- Gold: 80% actuarial value — higher premium, lower cost-sharing (best for people with regular medical needs)
- Platinum: 90% actuarial value — highest premium, lowest out-of-pocket costs

Catastrophic plans are also available to individuals under age 30 or those with a hardship exemption; they have very high deductibles and do not qualify for premium tax credits.

The Silver Benchmark Plan
APTC amounts are calculated based on the benchmark plan — the second-lowest-cost Silver plan available in your county. If you enroll in a plan that costs more than the benchmark, you pay the extra premium yourself. If you enroll in a cheaper plan, the credit amount stays the same and your premium cost drops accordingly (or may be $0).

Choosing the Right Metal Tier
- If you qualify for CSR (income 100–250% FPL), Silver plans are almost always the best choice because of the dramatic reduction in cost-sharing. Even if a Bronze plan has a lower premium after APTC, the higher deductible and out-of-pocket maximum of Bronze may cost more overall if you need significant medical care.
- If you do not qualify for CSR, compare the total cost (premium + expected out-of-pocket) across tiers based on your expected health care usage.
- Gold and Platinum plans make sense if you have chronic conditions, take multiple medications, or anticipate hospitalizations.


INCOME VERIFICATION AND REPAYMENT CAPS

How the Marketplace Verifies Income
Healthcare.gov verifies income through federal data sources including IRS records, Social Security Administration data, and state wage databases. If your self-reported income does not match federal records, you may receive an inconsistency notice and be required to provide documentation.

Acceptable Documentation for Income Verification
- Pay stubs (most recent, covering at least 4 weeks)
- Employer statement on official letterhead
- Federal tax return from the most recent tax year
- Social Security award letter (for SS income)
- Pension or retirement account statements
- Self-employment profit/loss records or bank statements

Repayment of Excess Credits — Detailed Rules
If your final income exceeds your estimated income, you may owe back some or all of your advance credits. The amount owed depends on how far your income exceeded the estimate:
- Income stayed at or below 400% FPL: repayment cap applies (see Form 8962 reconciliation section)
- Income exceeded 400% FPL: all excess credits must be repaid (no cap), which can result in thousands of dollars owed

If you face a large repayment, consider: (1) Making an IRA contribution to reduce MAGI before the tax deadline; (2) checking whether you qualify for an exception (household size errors, incorrect Marketplace estimates); (3) setting up a payment plan with the IRS.

Avoiding Repayment Problems
- Report income changes promptly through Healthcare.gov
- Be conservative in estimating income if you are self-employed or have variable earnings
- Review your advance credit amounts each November during Open Enrollment — update your estimated income for the coming year
- Keep Form 1095-A and all insurance correspondence for tax filing


TEXAS-SPECIFIC ENROLLMENT INFORMATION AND NAVIGATOR HELP

Texas Open Enrollment Dates
Texas uses Healthcare.gov (the federally facilitated Marketplace). Open Enrollment in Texas follows federal dates:
- Open Enrollment start: November 1
- Deadline for January 1 coverage: December 15
- Final deadline for coverage starting February 1: January 15
After January 15, enrollment requires a qualifying Special Enrollment Period event.

Navigator and Certified Application Counselors (CAC)
Trained, certified assisters are available across Texas to help consumers with free enrollment assistance:
- Navigators: federally funded consumer assisters who help with enrollment, plan selection, and appeals. Find a navigator at localhelp.healthcare.gov.
- Certified Application Counselors (CAC): work at community organizations, clinics, and libraries. Also listed at localhelp.healthcare.gov.
- Agents and brokers: licensed insurance professionals who can help enroll you in Marketplace plans. Navigators and CACs cannot recommend specific plans; agents and brokers may.

Immigrant Families and ACA Eligibility
Undocumented immigrants are not eligible for Marketplace coverage or premium tax credits. However:
- Lawfully present immigrants (green card holders, refugees, asylees, visa holders, DACA recipients — check current rules) ARE eligible for Marketplace coverage and premium tax credits even if they have been in the U.S. fewer than 5 years (unlike Medicaid).
- Mixed-status families (some members documented, some not) can enroll eligible family members separately. The income of all household members counts toward the household income for APTC calculations, even for undocumented members.
- Marketplace applications do not collect or report immigration status for unenrolled household members to immigration enforcement.
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

  // Clear previously seeded chunks for this user (avoid duplicate data on re-seed)
  try {
    await es.deleteByQuery({
      index: CHUNK_INDEX,
      query: { term: { user_name: TARGET_USER } },
      refresh: true,
    });
    console.log(`Cleared existing ES chunks for user: ${TARGET_USER}`);
  } catch (e) {
    // Index may not exist yet on first run
    console.log('No existing chunks to clear (first run)');
  }

  // Clear MongoDB documents for this user
  await Document.deleteMany({ user_name: TARGET_USER });
  console.log(`Cleared existing MongoDB documents for user: ${TARGET_USER}`);

  const DOC_KEY_MAP = {
    'CHIP Program Overview — Texas':                                            'chip',
    'Texas Medicaid — Eligibility and Benefits Overview':                      'medicaid',
    'How to File a Health Insurance Complaint — Texas Department of Insurance': 'tdi',
    'Premium Tax Credits and ACA Marketplace Insurance — Overview':            'aca',
  };
  const docIdMap = {};

  for (const doc of DOCUMENTS) {
    const docId = uuidv4();
    const key = DOC_KEY_MAP[doc.title];
    if (key) docIdMap[key] = docId;
    const text = doc.content.trim();
    const chunks = splitTextWithOverlap(text);
    const docLanguage = detectLanguage(text);

    console.log(`\nIngesting: "${doc.title}" — ${chunks.length} chunks (${text.length} chars)`);

    // Print chunk map so ground-truth labels can be verified
    chunks.forEach((chunk, i) => {
      const preview = chunk.content.slice(0, 80).replace(/\n/g, ' ');
      console.log(`  [chunk ${i}] ${preview}...`);
    });

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

  const __seedDirname = path.dirname(fileURLToPath(import.meta.url));
  const evalDir = path.resolve(__seedDirname, '../../eval');
  fs.mkdirSync(evalDir, { recursive: true });
  fs.writeFileSync(
    path.join(evalDir, 'seed-doc-ids.json'),
    JSON.stringify(docIdMap, null, 2)
  );
  console.log('\nWrote eval/seed-doc-ids.json:', docIdMap);

  console.log('\nSeeding complete.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
