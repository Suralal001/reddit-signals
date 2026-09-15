-- The Project Skin (theprojectskin.com) — Indian D2C skincare, Reddit only.
--
-- Reddit is the whole channel set here on purpose: LinkedIn, X, Hacker News,
-- GitHub and Stack Overflow carry B2B buying conversation, and an Indian buyer
-- asking which sunscreen does not leave a white cast on her skin tone is on
-- Reddit and effectively nowhere else we can read. No Apify actor is seeded, so
-- this project costs nothing to run.
--
-- Policies are deliberately one notch stricter than the likely truth and every
-- channel rule is verified = 0: Reddit blocks automated sidebar reads from this
-- environment, so subscriber counts and topic mix were confirmed against a
-- third-party index but no rule text was read first-hand. Check each sidebar
-- before the first reply there and tick the row.
--
-- Two rules in the playbook are legal rather than stylistic: ASCI's influencer
-- guidelines make an employment relationship a material connection that must be
-- disclosed up front in the post body, and the Drugs and Cosmetics Act 1940 with
-- the Cosmetics Rules 2020 (restated by CDSCO on 18 May 2026) put "treats acne"
-- on the drug side of the line, where a cosmetic may not go.
PRAGMA defer_foreign_keys=ON;

INSERT INTO "Project" ("id","name","slug","createdAt")
SELECT 'proj_projectskin', 'The Project Skin', 'projectskin', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Project" WHERE "id" = 'proj_projectskin');


INSERT INTO "Settings" ("id","projectId","brandName","productDesc","audience","voice","competitors","alertThreshold","slackWebhook","lookbackDays","dailyReplyCap","playbook","updatedAt")
SELECT 'set_projectskin', 'proj_projectskin', '', '', '', '', '[]', 70, '', 7, 4, '{}', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Settings" WHERE "projectId" = 'proj_projectskin');
UPDATE "Settings" SET
  "brandName" = 'The Project Skin',
  "productDesc" = 'The Project Skin is a Bengaluru-based Indian D2C skincare brand built on ingredient literacy — stated concentrations backed by published research, formulated for Indian heat, humidity, pollution and Indian skin tones. Range: 5% Niacinamide Serum (₹649), Refreshing Cleanser (₹399), Calming Moisturiser (₹449), Protecting Sunscreen SPF 50 (₹649), Active Boba Encapsulated Cream with niacinamide, salicylic acid and zinc PCA (₹1,199), Clear Seal Liquid Patch (₹399), and a complete 4-step kit (₹1,699).',
  "audience" = 'Indian skincare buyers, roughly 18–35 and skewing metro (Bengaluru, Mumbai, Delhi, Hyderabad, Chennai, Pune), who read ingredient lists before they buy: dealing with oily and acne-prone skin, post-acne marks and pigmentation in a hot humid climate, and sceptical of brands that market a percentage they cannot justify. Never minors.',
  "voice" = 'A knowledgeable friend who happens to work at the brand, not a brand voice. Answer the skin question first and completely, in plain English with the actual ingredient reasoning; recommend other brands by name when they fit better; say clearly what a cosmetic cannot do; disclose employment whenever the brand is named; no hype words, no exclamation marks, no emoji.',
  "competitors" = '["Minimalist","Deconstruct","Suganda","The Ordinary","Foxtale","The Derma Co","Aqualogica","Re''equil","Dot & Key","Pilgrim","Plum","Earth Rhythm","Cetaphil","CeraVe"]',
  "alertThreshold" = 70,
  "lookbackDays" = 7,
  "dailyReplyCap" = 4,
  "playbook" = '{"positioning":"The Project Skin is a Bengaluru-based Indian skincare brand built on ingredient literacy: \"literacy first, formulations second\". Every product states what is in it and at what concentration, backed by published research, and every ingredient has to earn its place on the label — the brand explicitly rejects vague copy like \"enriched with\". The range is small and deliberately so: a 5% Niacinamide Serum (₹649), a Refreshing Cleanser (₹399), a Calming Moisturiser (₹449), a Protecting Sunscreen SPF 50 (₹649), the Active Boba Encapsulated Cream with niacinamide, salicylic acid and zinc PCA (₹1,199), the Clear Seal Liquid Patch (₹399), and a complete 4-step kit (₹1,699). It is formulated for Indian conditions — heat, humidity, sweat and pollution — and for Indian skin tones, which is the difference between a sunscreen that works on paper and one a person will actually reapply at 3pm in Chennai. It is for the Indian buyer who has read enough to be sceptical: who wants the percentage, the reason, and an honest answer about what a cosmetic cannot do.","pillars":"Concentration on the label — the exact percentage, and the published reason it is that percentage rather than a bigger number that markets better.\nFormulated for Indian conditions — humidity, sweat, pollution, and Indian skin tones, including no white cast or greying.\nA short range, not a catalogue — four to seven products that cover a real routine, instead of one launch a month.\nHonest about limits — a cosmetic improves the appearance of skin; it does not treat disease, and we say so.","proofPoints":"Use only what the site states: dermatologist-formulated, lab tested, stated concentration ranges backed by published research, formulated for Indian climate and skin tones.\nPrices are public and may be quoted exactly: Niacinamide Serum 5%, 30ml ₹649 · Refreshing Cleanser 100ml ₹399 · Calming Moisturiser 50ml ₹449 · Protecting Sunscreen SPF 50, 50ml ₹649 · Active Boba Encapsulated Cream 50g ₹1,199 · Clear Seal Liquid Patch 15ml ₹399 · 4-step kit ₹1,699.\nIngredient facts that can be stated as ingredient science rather than product claims: niacinamide at 4–5% is the range most published work supports for sebum and pigmentation endpoints, and higher percentages mainly raise the irritation risk; salicylic acid is oil-soluble and works inside the pore; zinc PCA is a sebum-modulating chelate.\nIf asked for clinical data, trial sizes, dermatologist names or before/after results: say what we actually have, and nothing more. Under ASCI''s code a claim that rests on independent research must show the source and date, so either cite it properly or do not make it.\nNever invent a statistic, a study, a percentage of users, a review count or a customer story.","differentiators":"vs Minimalist: genuinely the brand that made ingredient transparency normal in India, and its SPF 50 light fluid is a deserved favourite — say that plainly. Since HUL acquired its parent (announced Jan 2025, ~₹2,955 cr valuation) a lot of buyers are asking whether founder-led formulation survives a conglomerate. Do not answer that question for them and never sneer at it; the honest line is that we are small, still founder-led, and the percentages are on our label too.\nvs Deconstruct: the closest direct comparison — its Clearing Serum is 5% niacinamide with 2% alpha arbutin, which is a good formula. The difference is a range built around Indian climate performance rather than a concern-per-SKU catalogue.\nvs Suganda: the same chemist-led, small-batch, transparency-first philosophy, and a 5% niacinamide serum of its own. A fair answer is that a buyer choosing between us and Suganda is choosing between two brands doing the same honest thing; texture and sunscreen performance are where we would ask them to compare.\nvs The Derma Co / Aqualogica (Honasa) and Pilgrim: far bigger marketing spend and far wider ranges. We compete on the label, not the launch calendar. Note that distribution and brand fatigue issues are theirs to answer, not ours to attack.\nvs Dot & Key and Earth Rhythm: now retailer-owned (Nykaa). Shelf advantage is real; independence is ours.\nvs The Ordinary: the global benchmark for percentage-on-the-label, and cheaper per ml. The practical difference in India is texture and sunscreen in humidity, plus the fact that buying genuine Ordinary in India means one authorised channel.\nvs Cetaphil, CeraVe, Sebamed, Fixderma: the pharmacy-and-dermatologist default, and often the right answer — if someone''s dermatologist put them on a specific cleanser, agree with the dermatologist.\nFairness rule: name what the other brand does well before anything else. Indian skincare Reddit is ingredient-literate and it checks.","objections":"\"Why 5% niacinamide when other brands sell 10%?\" → Because the published evidence clusters around 4–5% for sebum and pigmentation endpoints, and above that the main thing that rises is irritation. Higher numbers market better than they perform. Honest caveat: some people do fine on 10%.\n\"Is the Active Boba cream fungal-acne safe?\" → Answer from the actual ingredient list and say so explicitly; if a component is a known Malassezia feeder, say that too. This will be the most-asked question we get, and the only wrong answer is a confident vague one.\n\"Will your sunscreen leave a white cast on my skin tone?\" → Give the filter system and the honest texture description, and tell them that on deeper tones the only real test is a swatch in daylight. Never claim \"zero white cast\" as an absolute.\n\"Does this treat my acne?\" → It does not, and by law a cosmetic cannot claim to. What it can do is help with oil, the appearance of marks, and barrier support. Persistent or cystic acne is a dermatologist''s job, and saying so loses a sale and earns a customer.\n\"Another Indian brand with big claims.\" → Fair scepticism given the category. The answer is the label: the percentage, the reason, and what it will not do.\n\"Is it worth ₹649 when a dupe is ₹299?\" → Say what the cheaper option does well and where the difference actually is (texture, filters, finish). If the cheaper product genuinely suits them, say that.\n\"Where do I buy the genuine one?\" → The brand''s own site is the one channel we can vouch for; if they bought elsewhere and it looks off, help them check rather than blaming the retailer.","disclosure":"Disclosure: I work at The Project Skin (employee), so weigh what I say accordingly.","doNotSay":"Never say a product treats, cures, heals or prevents acne, fungal acne, rosacea, eczema or any condition. Under the Drugs and Cosmetics Act 1940 and the Cosmetics Rules 2020 that is a drug claim, and CDSCO restated the line in a public notice on 18 May 2026. \"Helps visibly reduce the appearance of marks\" is the defensible form.\nNever give medical advice, never suggest a dose or a substitute for a prescription, and never comment on isotretinoin, tretinoin, antibiotics or hormonal treatment beyond \"that is a question for your dermatologist\".\nNever reply as the brand in r/acne, r/AcneScars, r/tretinoin, r/Accutane, r/Rosacea or r/PCOS. People there are under medical care and are not a market.\nNever engage in r/IndianTeenagers, r/teenagers or any thread where the author is visibly a minor. No exceptions, in either direction — not a reply, not a recommendation.\nNever post without the employee disclosure when the brand is named. ASCI''s influencer guidelines require it up front, in the post body, not in a bio or a hashtag — and it applies \"even if the evaluations are unbiased\".\nNever say \"clinically proven\", \"dermatologically tested\" or \"studies show\" unless we can produce the study and state its source and date, as ASCI Clause 1.2 requires.\nNever invent numbers, user counts, review scores, percentages, trial results or customer stories. Never post before/after photos.\nNever claim an absolute: no \"zero white cast\", \"no irritation\", \"suits everyone\", \"100% safe\", \"non-comedogenic for everybody\".\nNever trash another Indian brand, and never bring up the HUL or Nykaa acquisitions as an attack. If a customer raises it, be neutral.\nNever use marketing language: \"game-changer\", \"holy grail\", \"glass skin guaranteed\", \"must-have\", \"unlock\", exclamation marks, emoji.\nNever mention the brand in a NO_PROMO subreddit, or in a VALUE_ONLY subreddit unless the author explicitly asked what to buy.\nNever DM anyone who did not ask. Never reply twice in the same thread. Never use more than one account in a thread.","ctaPolicy":"Default: no link, no CTA. The reply has to be worth reading even if the person never buys anything.\nIf the author explicitly asks what to buy or where: name the product once, with the price, with the disclosure, and stop. theprojectskin.com only if they asked for a link — no tracking parameters, no coupon codes.\nIf they ask for a routine: give the routine, including steps that are not our products (a cleanser we don''t make, a dermatologist visit, sunscreen reapplication habits). A recommendation that only contains our own SKUs reads as an ad and will be treated as one.\nIf someone reports a reaction or a bad order: no CTA at all. Apologise, ask what happened, move it to support, and follow up publicly when it is resolved.\nEverything else: end on a useful fact or a question about their skin, not a pitch.","angles":"RECOMMENDATION_REQUEST → Answer their actual concern first, with 2–3 options including at least one that is not ours (Deconstruct, Suganda, The Ordinary and a pharmacy brand are all honest picks). If the sub allows it, one sentence on where ours fits, with the price and the disclosure.\nVENDOR_EVALUATION → Compare on what is on the two labels: concentration, supporting actives, filter system, texture in humidity. Say what the other product does better. Mention ours only as one of the options, disclosed.\nRFP_PROCUREMENT → They are about to buy. Give the exact routine and order of application, flag what they do not need, answer the \"where do I buy genuine\" question directly, and disclose.\nCOMPLIANCE_AUDIT → Suitability and safety questions are the highest-trust moment we get. Answer from the ingredient list, name the component that causes the concern, say plainly when the answer is \"don''t use this\" or \"patch test first\". Never round a safety answer up.\nCOST_TOKEN_SPEND → Take the budget seriously. Say what the cheaper product does well, and where the extra spend actually goes. If the ₹299 option suits them, tell them to buy it.\nPAIN_CURRENT_TOOL → Diagnose the failure before offering anything: white cast is a filter-system problem, pilling is usually a layering or silicone interaction, stinging is often the actives order, \"no difference in 3 months\" is often a missing sunscreen. A fix inside their current routine earns more trust than a swap.\nAI_ROLLOUT → Someone starting or rebuilding a routine. Give the minimum viable routine — cleanse, moisturise, sunscreen — and tell them to add one active at a time, two weeks apart. Product mention optional and last.\nCOMPETITOR_DISSATISFACTION → Be scrupulously fair to the brand they are unhappy with. Ask what specifically failed. If it is an acquisition-trust question, stay neutral and talk about what is verifiable on a label rather than who owns whom.\nBRAND_QUESTION → Answer completely, including the unflattering parts: the concentration, why it is that number, what the product will not do, the price. No selling.\nBRAND_COMPLAINT → Own it immediately. No defensiveness, no \"sorry you feel that way\". Concrete next step, real follow-up, and if we got it wrong, say we got it wrong.\nDISCUSSION → Contribute ingredient or climate knowledge with no product mention. This is how a brand account earns the right to answer question 1 later.\nNONE → Skip."}',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin';


-- Channel rules ------------------------------------------------------------
INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'IndianSkincareAddicts', 'VALUE_ONLY', '~320k, the main one, science-first culture. Flair enforcement is real: ''I Followed Posting Rules'' is the dominant flair and a second flair exists whose text says 5 reports removes the post. Answer as a knowledgeable person, cite ingredient concentrations, name the brand only if the author explicitly asks what to buy — and then with the employee disclosure.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianSkincareAddicts');
UPDATE "SubredditRule" SET "policy" = 'VALUE_ONLY', "notes" = '~320k, the main one, science-first culture. Flair enforcement is real: ''I Followed Posting Rules'' is the dominant flair and a second flair exists whose text says 5 reports removes the post. Answer as a knowledgeable person, cite ingredient concentrations, name the brand only if the author explicitly asks what to buy — and then with the employee disclosure.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianSkincareAddicts';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'skincareaddictsindia', 'VALUE_ONLY', '~261k and growing fast (+161%/yr) — the fastest-growing Indian skincare sub, so worth watching daily. Advice and solution requests dominate. Same posture as IndianSkincareAddicts: substance first, disclosure whenever the brand is named.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'skincareaddictsindia');
UPDATE "SubredditRule" SET "policy" = 'VALUE_ONLY', "notes" = '~261k and growing fast (+161%/yr) — the fastest-growing Indian skincare sub, so worth watching daily. Advice and solution requests dominate. Same posture as IndianSkincareAddicts: substance first, disclosure whenever the brand is named.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'skincareaddictsindia';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'IndianBeautyTalks', 'VALUE_ONLY', '~95k, growing very fast. Top flair is Questions/Advice; it also has a ''Fake / Counterfeit'' flair, so authenticity anxiety is a live genre here. Good sub for honest answers about where to buy genuine product.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianBeautyTalks');
UPDATE "SubredditRule" SET "policy" = 'VALUE_ONLY', "notes" = '~95k, growing very fast. Top flair is Questions/Advice; it also has a ''Fake / Counterfeit'' flair, so authenticity anxiety is a live genre here. Good sub for honest answers about where to buy genuine product.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianBeautyTalks';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'IndiaSkincare', 'VALUE_ONLY', '~10k but growing explosively. Small enough that a brand account replying twice in a week is conspicuous. Routine and shelfie flairs.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndiaSkincare');
UPDATE "SubredditRule" SET "policy" = 'VALUE_ONLY', "notes" = '~10k but growing explosively. Small enough that a brand account replying twice in a week is conspicuous. Routine and shelfie flairs.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndiaSkincare';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'IndianMakeupAddicts', 'NO_PROMO', '~212k. Third-party summaries say self-promotion is banned outright. Useful for dupe-seeking and counterfeit signals; never name the brand here.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianMakeupAddicts');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~212k. Third-party summaries say self-promotion is banned outright. Useful for dupe-seeking and counterfeit signals; never name the brand here.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianMakeupAddicts';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'IndianBeautyDeals', 'NO_PROMO', '~159k deals and coupon sub. A brand posting its own discount reads as spam even where it is tolerated. Monitoring only — price-sensitivity signal lives here.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianBeautyDeals');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~159k deals and coupon sub. A brand posting its own discount reads as spam even where it is tolerated. Monitoring only — price-sensitivity signal lives here.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianBeautyDeals';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'indianbeautyhauls', 'NO_PROMO', '~136k, ''Haul of the Month''. Organic mentions of the brand in hauls are the signal worth reading; never reply as the brand.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'indianbeautyhauls');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~136k, ''Haul of the Month''. Organic mentions of the brand in hauls are the signal worth reading; never reply as the brand.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'indianbeautyhauls';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'IndianFashionAddicts', 'NO_PROMO', '~574k but mostly off-topic for skincare; has a scam-alerts culture. Monitoring only.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianFashionAddicts');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~574k but mostly off-topic for skincare; has a scam-alerts culture. Monitoring only.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianFashionAddicts';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'india', 'NO_PROMO', '~3.5M. Skincare comes up as consumer-brand discussion, not advice. Never promote.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'india');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~3.5M. Skincare comes up as consumer-brand discussion, not advice. Never promote.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'india';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'indiasocial', 'NO_PROMO', '~1.8M. Casual; brand talk is fine as a topic, brand participation is not.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'indiasocial');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~1.8M. Casual; brand talk is fine as a topic, brand participation is not.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'indiasocial';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'AskIndia', 'NO_PROMO', '~907k. Occasional ''which brand is actually good'' threads. Answer only without naming the brand.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'AskIndia');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~907k. Occasional ''which brand is actually good'' threads. Answer only without naming the brand.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'AskIndia';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'bangalore', 'NO_PROMO', '~1.1M, home city. Dermatologist-recommendation threads appear here. Local-brand pride is real but a promo comment in a city sub is remembered.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'bangalore');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~1.1M, home city. Dermatologist-recommendation threads appear here. Local-brand pride is real but a promo comment in a city sub is remembered.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'bangalore';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'TwoXIndia', 'NO_PROMO', '~369k, women and non-binary members only — men cannot post, so operator gender matters here. Treat as read-only.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'TwoXIndia');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~369k, women and non-binary members only — men cannot post, so operator gender matters here. Treat as read-only.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'TwoXIndia';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'SkincareAddiction', 'NO_PROMO', '~5M and heavily moderated; the only self-promotion that survives is educational, and that is not verified. Treat as no-promo. Excellent for learning the vocabulary people use.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'SkincareAddiction');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~5M and heavily moderated; the only self-promotion that survives is educational, and that is not verified. Treat as no-promo. Excellent for learning the vocabulary people use.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'SkincareAddiction';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'SkincareAddicts', 'VALUE_ONLY', '~1.2M, looser than SkincareAddiction. Still no product naming unless asked outright.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'SkincareAddicts');
UPDATE "SubredditRule" SET "policy" = 'VALUE_ONLY', "notes" = '~1.2M, looser than SkincareAddiction. Still no product naming unless asked outright.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'SkincareAddicts';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'AsianBeauty', 'VALUE_ONLY', '~3.8M, runs a weekly ''Fluff Friday'' megathread. Sunscreen-texture expertise is the culture here — the single best place to learn what ''no white cast'' actually means to people.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'AsianBeauty');
UPDATE "SubredditRule" SET "policy" = 'VALUE_ONLY', "notes" = '~3.8M, runs a weekly ''Fluff Friday'' megathread. Sunscreen-texture expertise is the culture here — the single best place to learn what ''no white cast'' actually means to people.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'AsianBeauty';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', '30PlusSkinCare', 'VALUE_ONLY', '~2.4M. Pigmentation and barrier threads; an Indian brand is an unusual answer, so only reply where it genuinely fits.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = '30PlusSkinCare');
UPDATE "SubredditRule" SET "policy" = 'VALUE_ONLY', "notes" = '~2.4M. Pigmentation and barrier threads; an Indian brand is an unusual answer, so only reply where it genuinely fits.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = '30PlusSkinCare';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'acne', 'NO_PROMO', '~1.7M and full of people in distress, many on prescription treatment. Never promote here, ever. If an operator replies at all it is with encouragement and a suggestion to see a dermatologist — no product, no brand.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'acne');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~1.7M and full of people in distress, many on prescription treatment. Never promote here, ever. If an operator replies at all it is with encouragement and a suggestion to see a dermatologist — no product, no brand.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'acne';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'AcneScars', 'NO_PROMO', '~46k. Scar treatment is a clinical topic (lasers, microneedling, TCA). A cosmetic serum is not an answer to scarring; do not imply otherwise.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'AcneScars');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~46k. Scar treatment is a clinical topic (lasers, microneedling, TCA). A cosmetic serum is not an answer to scarring; do not imply otherwise.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'AcneScars';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'tretinoin', 'NO_PROMO', '~292k. Prescription-only in India. Adjacent products get mentioned, but a brand commenting in a prescription-drug sub invites exactly the wrong scrutiny. Read-only.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'tretinoin');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~292k. Prescription-only in India. Adjacent products get mentioned, but a brand commenting in a prescription-drug sub invites exactly the wrong scrutiny. Read-only.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'tretinoin';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'Accutane', 'NO_PROMO', '~110k. Isotretinoin patients; barrier-care questions are common and sincere. Read-only — never sell to someone on a systemic retinoid.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'Accutane');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~110k. Isotretinoin patients; barrier-care questions are common and sincere. Read-only — never sell to someone on a systemic retinoid.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'Accutane';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'Rosacea', 'NO_PROMO', '~119k. A medical condition, not a skincare concern. Read-only.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'Rosacea');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~119k. A medical condition, not a skincare concern. Read-only.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'Rosacea';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'Blackskincare', 'NO_PROMO', '~158k. The white-cast and flashback conversation is most honest here and worth reading closely, but the brand does not ship there. Read-only.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'Blackskincare');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~158k. The white-cast and flashback conversation is most honest here and worth reading closely, but the brand does not ship there. Read-only.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'Blackskincare';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'koreanskincare', 'NO_PROMO', '~178k. K-beauty comparisons drive a lot of Indian purchase decisions; useful context, wrong place to participate.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'koreanskincare');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~178k. K-beauty comparisons drive a lot of Indian purchase decisions; useful context, wrong place to participate.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'koreanskincare';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'PCOS', 'NO_PROMO', '~315k. Hormonal acne here is a symptom of an endocrine condition under medical management. Read-only, and never frame a cosmetic as an answer.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'PCOS');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = '~315k. Hormonal acne here is a symptom of an endocrine condition under medical management. Read-only, and never frame a cosmetic as an answer.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'PCOS';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'IndianTeenagers', 'NO_PROMO', 'HARD EXCLUSION. ~431k and predominantly minors. Do not monitor for leads, do not reply, do not market. Present in this table only so the policy is already on file if someone adds the sub to a monitor by accident.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianTeenagers');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = 'HARD EXCLUSION. ~431k and predominantly minors. Do not monitor for leads, do not reply, do not market. Present in this table only so the policy is already on file if someone adds the sub to a monitor by accident.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'IndianTeenagers';

INSERT INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'sr_' || lower(hex(randomblob(8))), 'proj_projectskin', 'REDDIT', 'teenagers', 'NO_PROMO', 'HARD EXCLUSION — minors. Same as above.', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubredditRule" WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'teenagers');
UPDATE "SubredditRule" SET "policy" = 'NO_PROMO', "notes" = 'HARD EXCLUSION — minors. Same as above.', "verified" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "projectId" = 'proj_projectskin' AND "platform" = 'REDDIT' AND "name" = 'teenagers';


-- Monitors -----------------------------------------------------------------
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T1 — Product & routine requests', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T1 — Product & routine requests');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["sunscreen recommendation","serum recommendation","moisturiser recommendation","cleanser recommendation","niacinamide serum","recommend a sunscreen","suggest a serum","help with my routine","critique my routine","beginner routine","what should I use","which one should I buy","skincare routine for oily skin"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T1 — Product & routine requests';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T1 — Acne, marks & pigmentation', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T1 — Acne, marks & pigmentation');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["hormonal acne","fungal acne","closed comedones","acne marks","post acne marks","acne scars","purging or breakout","forehead bumps","chin acne","back acne","hyperpigmentation","dark spots","textured skin"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","acne","AcneScars"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T1 — Acne, marks & pigmentation';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T1 — Sunscreen: white cast & Indian climate', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T1 — Sunscreen: white cast & Indian climate');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["white cast","no white cast","grey cast","ashy cast","sunscreen pilling","sweat proof sunscreen","sunscreen for oily skin","sunscreen reapplication","sunscreen humid weather","sunscreen under makeup","sunscreen for brown skin","flashback sunscreen","SPF 50 India"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","SkincareAddiction","AsianBeauty","Blackskincare"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T1 — Sunscreen: white cast & Indian climate';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T2 — Ingredient & actives questions', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T2 — Ingredient & actives questions');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["niacinamide and vitamin c","5% vs 10% niacinamide","salicylic acid","zinc PCA","fungal acne safe","FA safe","is this purging","how to layer actives","barrier repair","ingredient percentage","pregnancy safe skincare","niacinamide irritation"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","SkincareAddiction","SkincareAddicts","AsianBeauty","30PlusSkinCare"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T2 — Ingredient & actives questions';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T2 — Dupes, budget & value', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T2 — Dupes, budget & value');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["dupe for","cheaper alternative","affordable serum","budget skincare","under 500","under 1000","worth the price","is it worth buying","value for money","too expensive skincare"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","IndianMakeupAddicts","IndianBeautyDeals","indianbeautyhauls","IndianFashionAddicts"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T2 — Dupes, budget & value';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T3 — Brand trust & counterfeits', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T3 — Brand trust & counterfeits');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["is it legit","is this genuine","fake product","counterfeit skincare","Nykaa genuine","Amazon fake","which brand to trust","Indian skincare brand","does it actually work","marketing gimmick"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","IndianMakeupAddicts","IndianBeautyDeals","indianbeautyhauls","IndianFashionAddicts"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T3 — Brand trust & counterfeits';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T4 — Competitor watch: actives brands', 'COMPETITOR', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T4 — Competitor watch: actives brands');
UPDATE "Monitor" SET "kind" = 'COMPETITOR', "keywords" = '["Minimalist","Deconstruct","Suganda","The Ordinary","Foxtale","Derma Co","Aqualogica","Re''equil","Dot & Key","Pilgrim","Plum","Earth Rhythm"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","IndianMakeupAddicts","IndianBeautyDeals","indianbeautyhauls","IndianFashionAddicts"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T4 — Competitor watch: actives brands';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T4 — Acquisition & trust shift', 'COMPETITOR', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T4 — Acquisition & trust shift');
UPDATE "Monitor" SET "kind" = 'COMPETITOR', "keywords" = '["Minimalist HUL","acquired by HUL","sold to HUL","Nykaa acquired","formula changed","quality has dropped","not the same anymore","founder left","brand got acquired","Mamaearth","Honasa"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","india","indiasocial","AskIndia","bangalore","TwoXIndia"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T4 — Acquisition & trust shift';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'T5 — Dermatologist access & cost', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'T5 — Dermatologist access & cost');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["dermatologist recommendation","dermat in Bangalore","dermatologist cost","online dermatologist","tretinoin prescription","dermat sold me","skin consultation","derm appointment"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare","india","indiasocial","AskIndia","bangalore","TwoXIndia"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'T5 — Dermatologist access & cost';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'Buying-intent phrases (comments)', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'Buying-intent phrases (comments)');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["what should I buy","any recommendations","which one should I get","broke me out","didn''t work for me","wasted my money","should I switch","help me choose","about to order","adding to cart"]', "subreddits" = '["IndianSkincareAddicts","skincareaddictsindia","IndianBeautyTalks","IndiaSkincare"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'Buying-intent phrases (comments)';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_projectskin', 'The Project Skin brand mentions', 'BRAND', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_projectskin' AND "name" = 'The Project Skin brand mentions');
UPDATE "Monitor" SET "kind" = 'BRAND', "keywords" = '["The Project Skin","theprojectskin","Project Skin","Active Boba","Clear Seal"]', "subreddits" = '[]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_projectskin' AND "name" = 'The Project Skin brand mentions';
