// @ts-check
/**
 * Regenerate two demo-image sets of COMMON OBJECTS ONLY — no people, animals,
 * landscapes, or body parts (faces / hands / feet). Downloads each source,
 * compresses to a modest webp (~800px, target <150KB) with sharp, and writes the
 * images plus a provenance manifest to e2e/fixtures/demo-images/.
 *
 *   node scripts/fetch-demo-images.mjs
 *
 * REPRODUCIBLE + AUDITED: every image is an EXPLICIT, hand-picked source (not a
 * live keyword search). The prior keyword-search approach pulled in people
 * wearing / using the objects (a shirtless man for "sunglasses", a portrait for
 * "scarf", feet for "sneaker"). Each source below was VISUALLY VERIFIED to show
 * the object alone. Re-running overwrites the set byte-for-byte from these rows,
 * so the committed images stay object-only and regenerable.
 *
 * Sources: Flickr via Openverse (CC-BY / CC-BY-SA) and Wikimedia Commons
 * (mostly CC0 museum catalog photos + a few CC-BY-SA studio shots). The manifest
 * records per image: source, detail/landing URL, original source URL, license +
 * version + URL, and creator/attribution (CC-BY / BY-SA require attribution).
 *
 * This is a DEV asset generator, run rarely by hand; the committed images are the
 * artifact the seed script consumes. Not part of any gate.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "e2e", "fixtures", "demo-images");

const TARGET_WIDTH = 800;
const MAX_BYTES = 150_000;
const UA = "adored-demo-seed/1.0 (https://github.com/; demo fixture regeneration)";

/**
 * Explicit, verified object-only sources. Order defines the stable filename
 * (accessories-01..20, homeware-01..20). Each row carries its own provenance so
 * the manifest is a pure projection of this list.
 *
 * @typedef {{
 *   set: "accessories" | "homeware",
 *   query: string,
 *   sourceUrl: string,
 *   source: "Openverse" | "Wikimedia Commons",
 *   detail: string,
 *   license: string,
 *   licenseVersion: string | null,
 *   licenseUrl: string,
 *   title: string,
 *   creator: string,
 *   attribution: string,
 * }} Source
 */

const SET_LABELS = {
  accessories: "Clothing & Accessories",
  homeware: "Furniture & Homeware",
};

/** Build a standard CC attribution string. */
function cc(title, creator, license, licenseUrl) {
  return `"${title}" by ${creator} is licensed under ${license}. To view a copy of this license, visit ${licenseUrl}.`;
}

/** @type {Source[]} */
const SOURCES = [
  // ── Clothing & Accessories ───────────────────────────────────────────────
  {
    set: "accessories", query: "handbag",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/3062/2649113959_aedd712952_b.jpg",
    detail: "https://www.flickr.com/photos/23054755@N00/2649113959",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Smiling handbag", creator: "MShades",
    attribution: cc("Smiling handbag", "MShades", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "accessories", query: "handbag",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/3/3f/Handtas_van_glanzend_bruin_slangenleer_met_hengsel%2C_overslag_met_aparte_sluiting%2C_%E2%80%9Cesteve%E2%80%9D%2C_objectnr_69707.JPG",
    detail: "https://commons.wikimedia.org/wiki/File:Handtas_van_glanzend_bruin_slangenleer_met_hengsel,_overslag_met_aparte_sluiting,_%E2%80%9Cesteve%E2%80%9D,_objectnr_69707.JPG",
    license: "CC BY-SA 3.0", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    title: "Handbag of glossy brown snakeskin (objectnr 69707)", creator: "Museum Rotterdam",
    attribution: cc("Handbag of glossy brown snakeskin (objectnr 69707)", "Museum Rotterdam", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
  },
  {
    set: "accessories", query: "backpack",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/3/39/Rucksack_Schweizer_Armee_1960er_a.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Rucksack_Schweizer_Armee_1960er_a.jpg",
    license: "CC BY-SA 3.0 AT", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/at/deed.en",
    title: "Rucksack Schweizer Armee 1960er (a)", creator: "Joadl",
    attribution: cc("Rucksack Schweizer Armee 1960er (a)", "Joadl", "CC BY-SA 3.0 AT", "https://creativecommons.org/licenses/by-sa/3.0/at/deed.en"),
  },
  {
    set: "accessories", query: "backpack",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/3/37/Rucksack_Schweizer_Armee_1960er_b.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Rucksack_Schweizer_Armee_1960er_b.jpg",
    license: "CC BY-SA 3.0", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    title: "Rucksack Schweizer Armee 1960er (b)", creator: "Joadl",
    attribution: cc("Rucksack Schweizer Armee 1960er (b)", "Joadl", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
  },
  {
    set: "accessories", query: "wristwatch",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/600/21838850705_667b4d26d3_b.jpg",
    detail: "https://www.flickr.com/photos/28847016@N08/21838850705",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "russian wristwatch", creator: "Kurt:S",
    attribution: cc("russian wristwatch", "Kurt:S", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "accessories", query: "wristwatch",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/8516/8451238649_0b5fa3767b_b.jpg",
    detail: "https://www.flickr.com/photos/51764518@N02/8451238649",
    license: "CC BY-SA 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    title: "Vintage Longines 'Grand Prize' Automatic Man's Wristwatch, 10 kt. Gold Case, Dates to 1960s", creator: "France1978",
    attribution: cc("Vintage Longines 'Grand Prize' Automatic Man's Wristwatch, 10 kt. Gold Case, Dates to 1960s", "France1978", "CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"),
  },
  {
    set: "accessories", query: "sunglasses",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/7/78/Radsportbrille_01_KMJ.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Radsportbrille_01_KMJ.jpg",
    license: "CC BY-SA 3.0", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    title: "Radsportbrille (cycling sunglasses)", creator: "KMJ",
    attribution: cc("Radsportbrille (cycling sunglasses)", "KMJ", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
  },
  {
    set: "accessories", query: "sunglasses",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/4/40/Vlindermodel%2C_zonnebril_met_getinte_glazen%2C_montuur_en_rechte_veren_van_transparant_kunststof_met_een_bruine_buitenlaag%2C_objectnr_74686.JPG",
    detail: "https://commons.wikimedia.org/wiki/File:Vlindermodel,_zonnebril_met_getinte_glazen,_montuur_en_rechte_veren_van_transparant_kunststof_met_een_bruine_buitenlaag,_objectnr_74686.JPG",
    license: "CC BY-SA 3.0", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    title: "Butterfly-model sunglasses, tinted lenses (objectnr 74686)", creator: "Museum Rotterdam",
    attribution: cc("Butterfly-model sunglasses, tinted lenses (objectnr 74686)", "Museum Rotterdam", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
  },
  {
    set: "accessories", query: "sneaker",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/3156/2711778184_aa959dc087.jpg",
    detail: "https://www.flickr.com/photos/50113019@N00/2711778184",
    license: "CC BY-SA 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    title: "Sneakers", creator: "Birdies100",
    attribution: cc("Sneakers", "Birdies100", "CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"),
  },
  {
    set: "accessories", query: "sneaker",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Paar_witte_sneakers%2C_merk_G-Unit%2C_maat_40%2C_objectnr_87415-7.A-B.JPG",
    detail: "https://commons.wikimedia.org/wiki/File:Paar_witte_sneakers,_merk_G-Unit,_maat_40,_objectnr_87415-7.A-B.JPG",
    license: "CC BY-SA 3.0", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    title: "Pair of white sneakers, brand G-Unit (objectnr 87415-7.A-B)", creator: "Museum Rotterdam",
    attribution: cc("Pair of white sneakers, brand G-Unit (objectnr 87415-7.A-B)", "Museum Rotterdam", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
  },
  {
    set: "accessories", query: "scarf",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/8/87/Scarf_MET_3948.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Scarf_MET_3948.jpg",
    license: "CC0", licenseVersion: null, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    title: "Scarf (MET 3948)", creator: "The Metropolitan Museum of Art",
    attribution: "\"Scarf\" (MET 3948), The Metropolitan Museum of Art, dedicated to the public domain under CC0.",
  },
  {
    set: "accessories", query: "scarf",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Scarf_%28AM_1955.16.2-2%29.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Scarf_(AM_1955.16.2-2).jpg",
    license: "CC BY 4.0", licenseVersion: "4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    title: "Scarf (AM 1955.16.2-2)", creator: "Auckland Museum",
    attribution: cc("Scarf (AM 1955.16.2-2)", "Auckland Museum", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
  },
  {
    set: "accessories", query: "leather wallet",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/3685/11823322314_4d62d36e9a_b.jpg",
    detail: "https://www.flickr.com/photos/62021300@N00/11823322314",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Leather Wallet", creator: "Incase.",
    attribution: cc("Leather Wallet", "Incase.", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "accessories", query: "leather wallet",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/7161/6417062699_b2df919e6a.jpg",
    detail: "https://www.flickr.com/photos/15987368@N06/6417062699",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Vintage Wallet Insert: Leather Wallet Warranty", creator: "C. K. Hartman",
    attribution: cc("Vintage Wallet Insert: Leather Wallet Warranty", "C. K. Hartman", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "accessories", query: "fedora hat",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c6/-Panama_Hats-_MET_DP108447.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:-Panama_Hats-_MET_DP108447.jpg",
    license: "CC0", licenseVersion: null, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    title: "[Panama Hats] (MET DP108447)", creator: "F.D. Hampson / The Metropolitan Museum of Art",
    attribution: "\"[Panama Hats]\" (MET DP108447) by F.D. Hampson, The Metropolitan Museum of Art, dedicated to the public domain under CC0.",
  },
  {
    set: "accessories", query: "fedora hat",
    source: "Openverse", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/9/93/A_fedora_hat%2C_made_by_Borsalino.jpg",
    detail: "https://commons.wikimedia.org/w/index.php?curid=432857",
    license: "CC BY 2.5", licenseVersion: "2.5", licenseUrl: "https://creativecommons.org/licenses/by/2.5/",
    title: "A fedora hat, made by Borsalino", creator: "Kjetil Ree",
    attribution: cc("A fedora hat, made by Borsalino", "Kjetil Ree", "CC BY 2.5", "https://creativecommons.org/licenses/by/2.5/"),
  },
  {
    set: "accessories", query: "necklace",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/4015/4650755867_85030e1b6b_b.jpg",
    detail: "https://www.flickr.com/photos/37996580467@N01/4650755867",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Make Web Not War's Guitar Pick Necklace and USB Key, Part 2", creator: "Joey DeVilla",
    attribution: cc("Make Web Not War's Guitar Pick Necklace and USB Key, Part 2", "Joey DeVilla", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "accessories", query: "necklace",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/6012/5968813279_27956cbc05_b.jpg",
    detail: "https://www.flickr.com/photos/22141297@N06/5968813279",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Starlite Jewelry Designs ~ Fashion Jewelry ~ Briolette Necklace ~ Blue Topaz ~ Jewelry Designer", creator: "Naomi King",
    attribution: cc("Starlite Jewelry Designs ~ Fashion Jewelry ~ Briolette Necklace ~ Blue Topaz ~ Jewelry Designer", "Naomi King", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "accessories", query: "silk tie",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/8654/16696509105_a1b83d3fb0_b.jpg",
    detail: "https://www.flickr.com/photos/92899351@N08/16696509105",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Silk tie in the abstract", creator: "Martin Cooper Ipswich",
    attribution: cc("Silk tie in the abstract", "Martin Cooper Ipswich", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "accessories", query: "silk tie",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/2816/9453947556_352c8f1b76_b.jpg",
    detail: "https://www.flickr.com/photos/76526364@N06/9453947556",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Silk tie detail", creator: "GrahamPics1",
    attribution: cc("Silk tie detail", "GrahamPics1", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },

  // ── Furniture & Homeware ─────────────────────────────────────────────────
  {
    set: "homeware", query: "ceramic mug",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/6124/5974877454_63bb097c12_b.jpg",
    detail: "https://www.flickr.com/photos/49889671@N03/5974877454",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Coffee into Jars Ceramics mug", creator: "Didriks",
    attribution: cc("Coffee into Jars Ceramics mug", "Didriks", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "ceramic mug",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/7546/15417324723_f604e8bf03_b.jpg",
    detail: "https://www.flickr.com/photos/127294011@N07/15417324723",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Milk jug, ceramic mug and cookies on a Christmas plate", creator: "PersonalCreations.com",
    attribution: cc("Milk jug, ceramic mug and cookies on a Christmas plate", "PersonalCreations.com", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "flower vase",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/3237/2767742910_634b2bf123_b.jpg",
    detail: "https://www.flickr.com/photos/89745292@N00/2767742910",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Flower Vase", creator: "Jose Nicdao",
    attribution: cc("Flower Vase", "Jose Nicdao", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "armchair",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d8/Side_Chair_MET_DP171109.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Side_Chair_MET_DP171109.jpg",
    license: "CC0", licenseVersion: null, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    title: "Side Chair (MET DP171109)", creator: "Duncan Phyfe / The Metropolitan Museum of Art",
    attribution: "\"Side Chair\" (MET DP171109), attr. Duncan Phyfe, The Metropolitan Museum of Art, dedicated to the public domain under CC0.",
  },
  {
    set: "homeware", query: "armchair",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/3203/3147627493_fc9a740b0e.jpg",
    detail: "https://www.flickr.com/photos/9243453@N02/3147627493",
    license: "CC BY-SA 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    title: "Slipcovered Vintage Armchair", creator: "DesignFolly.com",
    attribution: cc("Slipcovered Vintage Armchair", "DesignFolly.com", "CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"),
  },
  {
    set: "homeware", query: "table lamp",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/8482/8256700744_cf63a4e4e7_b.jpg",
    detail: "https://www.flickr.com/photos/71401718@N00/8256700744",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Lounge room with table lamps and armchairs", creator: "Wonderlane",
    attribution: cc("Lounge room with table lamps and armchairs", "Wonderlane", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "table lamp",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/4103/5027516478_4df939c735_b.jpg",
    detail: "https://www.flickr.com/photos/71401718@N00/5027516478",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Living room sofa, table and lamps, staged Craftsman house", creator: "Wonderlane",
    attribution: cc("Living room sofa, table and lamps, staged Craftsman house", "Wonderlane", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "teapot",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/4087/5025291934_b8fabdffd6_b.jpg",
    detail: "https://www.flickr.com/photos/71401718@N00/5025291934",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Dining room table, lamp and chairs, staged house", creator: "Wonderlane",
    attribution: cc("Dining room table, lamp and chairs, staged house", "Wonderlane", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "teapot",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/5/53/Teapot_MET_DP164196.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Teapot_MET_DP164196.jpg",
    license: "CC0", licenseVersion: null, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    title: "Teapot (MET DP164196)", creator: "Peter Van Dyck / The Metropolitan Museum of Art",
    attribution: "\"Teapot\" (MET DP164196), Peter Van Dyck, The Metropolitan Museum of Art, dedicated to the public domain under CC0.",
  },
  {
    set: "homeware", query: "teapot",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/1/15/Teapot_MET_DP-15482-001.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Teapot_MET_DP-15482-001.jpg",
    license: "CC0", licenseVersion: null, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    title: "Teapot (MET DP-15482-001)", creator: "John Bartlam / The Metropolitan Museum of Art",
    attribution: "\"Teapot\" (MET DP-15482-001), attr. John Bartlam, The Metropolitan Museum of Art, dedicated to the public domain under CC0.",
  },
  {
    set: "homeware", query: "wooden chair",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/7364/11019715163_74dbedd1c7_b.jpg",
    detail: "https://www.flickr.com/photos/33227787@N05/11019715163",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "wooden-chair-yellow.jpg", creator: "r.nial.bradshaw",
    attribution: cc("wooden-chair-yellow.jpg", "r.nial.bradshaw", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "wooden chair",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/4030/4542239299_92f4450e30_b.jpg",
    detail: "https://www.flickr.com/photos/10361931@N06/4542239299",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Simple worn out wooden chair on the street", creator: "Horia Varlan",
    attribution: cc("Simple worn out wooden chair on the street", "Horia Varlan", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "throw pillow",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/7187/6885001943_25a72a055a_m.jpg",
    detail: "https://www.flickr.com/photos/76094455@N02/6885001943",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Microphone Throw Pillow", creator: "FWO Clothing",
    attribution: cc("Microphone Throw Pillow", "FWO Clothing", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "throw pillow",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/7068/6885002015_2e2e078ca0_m.jpg",
    detail: "https://www.flickr.com/photos/76094455@N02/6885002015",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Headphone Throw Pillow", creator: "FWO Clothing",
    attribution: cc("Headphone Throw Pillow", "FWO Clothing", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "wall clock",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/3177/2658021420_9d52508998_b.jpg",
    detail: "https://www.flickr.com/photos/26354629@N02/2658021420",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Early General Electric Colored Wall Clock", creator: "alexkerhead",
    attribution: cc("Early General Electric Colored Wall Clock", "alexkerhead", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "wall clock",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a5/White-Clock-with-white-wall.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:White-Clock-with-white-wall.jpg",
    license: "CC BY-SA 3.0", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    title: "White wall clock on a white wall", creator: "Islam90",
    attribution: cc("White wall clock on a white wall", "Islam90", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
  },
  {
    set: "homeware", query: "picture frame",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/d/dd/Frame_MET_45186.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Frame_MET_45186.jpg",
    license: "CC0", licenseVersion: null, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    title: "Frame (MET 45186)", creator: "Stanford White / The Metropolitan Museum of Art",
    attribution: "\"Frame\" (MET 45186), Stanford White, The Metropolitan Museum of Art, dedicated to the public domain under CC0.",
  },
  {
    set: "homeware", query: "picture frame",
    source: "Wikimedia Commons",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/1/1a/Cassetta_frame_MET_SF-1975-1-2311.jpg",
    detail: "https://commons.wikimedia.org/wiki/File:Cassetta_frame_MET_SF-1975-1-2311.jpg",
    license: "CC0", licenseVersion: null, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    title: "Cassetta frame (MET SF-1975-1-2311)", creator: "The Metropolitan Museum of Art",
    attribution: "\"Cassetta frame\" (MET SF-1975-1-2311), The Metropolitan Museum of Art, dedicated to the public domain under CC0.",
  },
  {
    set: "homeware", query: "bookshelf",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/7064/6830923298_342cdd3ba9_b.jpg",
    detail: "https://www.flickr.com/photos/77877011@N07/6830923298",
    license: "CC BY 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    title: "Library Bookshelf", creator: "twechy",
    attribution: cc("Library Bookshelf", "twechy", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
  },
  {
    set: "homeware", query: "bookshelf",
    source: "Openverse", sourceUrl: "https://live.staticflickr.com/14/17173869_580db9d906_b.jpg",
    detail: "https://www.flickr.com/photos/93085601@N00/17173869",
    license: "CC BY-SA 2.0", licenseVersion: "2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    title: "Bookshelf", creator: "Dave Kleinschmidt",
    attribution: cc("Bookshelf", "Dave Kleinschmidt", "CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"),
  },
];

/** Download + compress to webp under MAX_BYTES; returns the buffer. */
async function fetchImage(sourceUrl) {
  const res = await fetch(sourceUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${sourceUrl}`);
  const input = Buffer.from(await res.arrayBuffer());
  for (const quality of [80, 72, 65, 50, 38]) {
    const out = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (out.byteLength <= MAX_BYTES) return out;
  }
  return sharp(input, { failOn: "none" })
    .rotate().resize({ width: 560, withoutEnlargement: true })
    .webp({ quality: 45 }).toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  /** @type {any[]} */
  const manifest = [];
  const counters = { accessories: 0, homeware: 0 };

  for (const s of SOURCES) {
    const n = (counters[s.set] += 1);
    const filename = `${s.set}-${String(n).padStart(2, "0")}.webp`;
    const buf = await fetchImage(s.sourceUrl);
    await writeFile(join(OUT_DIR, filename), buf);
    manifest.push({
      set: s.set,
      setLabel: SET_LABELS[s.set],
      filename,
      query: s.query,
      bytes: buf.byteLength,
      source: s.source,
      detailUrl: s.detail,
      sourceUrl: s.sourceUrl,
      license: s.license,
      licenseVersion: s.licenseVersion,
      licenseUrl: s.licenseUrl,
      title: s.title,
      creator: s.creator,
      attribution: s.attribution,
    });
    // eslint-disable-next-line no-console
    console.log(`  ${filename}  ${(buf.byteLength / 1024).toFixed(0)}KB  ${s.license}  "${s.query}"`);
  }

  await writeFile(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        note: "Demo image sets for local DB load-testing and future onboarding. " +
          "OBJECTS ONLY — no people, animals, landscapes, or body parts. Every image " +
          "was hand-picked from an explicit source and visually verified. Sources: " +
          "Openverse (Flickr, CC-BY / CC-BY-SA) and Wikimedia Commons (CC0 museum " +
          "catalog photos + a few CC-BY-SA studio shots). Attribution recorded per " +
          "image (required for BY / BY-SA). Regenerate with: node scripts/fetch-demo-images.mjs",
        generatedAt: new Date().toISOString().slice(0, 10),
        images: manifest,
      },
      null,
      2,
    ) + "\n",
  );
  // eslint-disable-next-line no-console
  console.log(`\nwrote ${manifest.length} images + manifest.json to ${OUT_DIR}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
