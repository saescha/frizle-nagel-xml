const co = require('co');
const fs = require('fs');
const Collmex = require('co-collmex');
const jsonxml = require('jsontoxml');
const dateFormat = require('dateformat');
const { assert } = require('console');

var collmex = new Collmex({
    User: "5055877",
    Password: "3769154",
    "CMXKundennummer": 146247,
    "Firma_Nr": 1,
    "Systemname": "koa-collmex-test"
});

function combine(sum, n) {
    if (sum < 1) return n;

    var index = n.findIndex((e) => e.r == sum);

    if (index != -1) {
        return n.filter((e, i) => { return i != index })
    }
    var result = null;
    for (var i = 0; i < n.length; i++) {
        result = combine(sum - n[i].r, n.filter((e2, i2) => { return i != i2 }));
        if (result) return result;
    }

    return null;
}
function berechneEuroPaletten(positionen) {
    var init = true;
    var kapazitaet;
    var maxlagen;
    var firma;
    if (positionen[0].firma == '1 frizle fresh foods AG') {
        var x = positionen.find(p => p.firma != '1 frizle fresh foods AG');
        if (firma) throw new Error('Produkte von 2 verschiedenen Firmen in selber Lieferung. Nicht gültig für Europalette')
        kapazitaet = 25;
        maxlagen = 7;
    } else if (positionen[0].firma == '28 Maram - Fertigwaren') {
        x = positionen.find(p => p.firma != '28 Maram - Fertigwaren');
        if (firma) throw new Error('Produkte von 2 verschiedenen Firmen in selber Lieferung. Nicht gültig für Europalette')
        kapazitaet = 18;
        maxlagen = 11;
    } else {
        throw new Error('Produkt von unbekannter Firma gefunden ' + (positionen[0].Firma));
    }

    var reste = [];
    var lagen = 0;
    var paletten = 0;
    positionen.forEach((p) => {
        if (p.Menge <= kapazitaet * 2) {
            var l = Math.floor(p.Menge / kapazitaet);

            lagen += l;
            if (l > 0) paletten++;
            var r = p.Menge % kapazitaet;
            if (r > 0) reste.push({ r: r, p: l > 0 });
        } else {
            lagen += Math.ceil(p.Menge / kapazitaet);
            paletten++;
        }
    });
    var restsum = reste.reduce((a, b) => a + b.r, 0);
    while (restsum > kapazitaet) {
        for (var space = 0; space < kapazitaet; space++) {
            var reduced = false;
            for (var i = 0; i < reste.length; i++) {
                var index = reste.findIndex((e) => e.r == kapazitaet - space);
                if (index < 0) {
                    var r = combine(kapazitaet - reste[i].r - space, reste.filter((e, i2) => i != i2));
                } else {
                    r = reste.filter((e, i2) => index != i2);
                }
                if (init) {
                    init = false;
                }
                if (r) {
                    lagen++;
                    paletten++;
                    reste = r;
                    var restsum = reste.reduce((a, b) => a + b.r, 0);
                    reduced = true;
                    break;
                }
            }
            if (reduced) {
                if (space > kapazitaet / 5) stellplaetze++;
                break;
            }

        }
    }
    if (reste.length > 1 || (reste.length == 1 && !reste[0].p)) { paletten++; } //Todo nochmal nachdenken
    if (restsum > 0) lagen++;
    var stellplaetze = Math.max(Math.ceil(lagen / maxlagen), Math.ceil(paletten / 4), Math.ceil((paletten + lagen) / 8));
    return { stellplaetze, paletten, lagen }
}
function main() {
    co(function* () {
        if (fs.existsSync('result.xml')) fs.unlinkSync('result.xml');
        var from = new Date();
        from.setDate(from.getDate() - 7)
        from = from.toISOString().split('T')[0];
        var c_lieferungen = yield collmex.get({ Satzart: "DELIVERY_GET" });
        c_lieferungen = c_lieferungen.filter(e => e.Satzart == 'CMXDLV' && e.Status.startsWith('40 ') && (e.Versandart.startsWith('1 Nagel ') || e.Versandart.startsWith('4 Nagel ')));
        var auftrags_nr = c_lieferungen.filter((e, i) => c_lieferungen.findIndex(v => v.Auftrag_Nr === e.Auftrag_Nr) === i);
        var c_produkte = yield collmex.get({ Satzart: "PRODUCT_GET" });
        var c_auftraege = yield collmex.get(auftrags_nr.map((e) => { return { 'Satzart': "SALES_ORDER_GET", 'Auftragsnummer': e.Auftrag_Nr } }));
        // fs.writeFileSync('lieferungen.json', JSON.stringify(c_lieferungen, null, 4));
        // fs.writeFileSync('produkte.json', JSON.stringify(c_produkte, null, 4));
        // fs.writeFileSync('auftraege.json', JSON.stringify(c_auftraege, null, 4));

        var lieferungen = {};
        c_lieferungen.forEach(s => {
            var n = s.Lieferungsnummer;
            if (s.Satzart === 'CMXDLV') {
                if (!lieferungen[n]) {
                    c_auftraege.forEach((e) => {
                        if (s.Auftrag_Nr != e.Auftragsnummer) return;
                        if (!e.Liefertermin) return;
                        if (!s.lieferdatum) {
                            s.lieferdatum = e.Liefertermin;
                            return;
                        }
                        if (s.lieferdatum != e.Liefertermin) throw new Error('Lieferung ' + s.Lieferungsnummer + ': unterschiedliche Liefertermine in Kundenauftrag ' + e.Auftragsnummer
                            + ' ' + s.lieferdatum + ' ' + e.Liefertermin)
                    });
                    if (!s.lieferdatum) throw new Error('Lieferung ' + s.Lieferungsnummer + ': kein Liefertermin in Kundenauftrag ' + s.Auftrag_Nr)
                    lieferungen[n] = s;
                    lieferungen[n].positionen = [];
                }

                var product = c_produkte.find(p => p.Produktnummer == s.Produktnummer);
                if (!product) {
                    throw new Error('Lieferung ' + s.Lieferungsnummer + ' unbekannte Produktnummer ' + s.Produktnummer)
                }

                var weight = 0;
                if (product.Gewicht_Mengeneinheit == 'KGM') {
                    weight = product.Gewicht
                } else if (product.Gewicht_Mengeneinheit == 'GRM') {
                    weight = product.Gewicht / 1000
                } else {
                    throw new Error('Unbekannte Gewichteinheit ' + product.Gewicht_Mengeneinheit + ' von Produktnummer ' + product.Produktnummer)
                }
                var x = {
                    typ: s.Positionstyp,
                    nr: s.Produktnummer,
                    text: s.Produktbeschreibung,
                    einheit: s.Mengeneinheit,
                    Menge: s.Menge,
                    kundenauftragsposition: s.Kundenauftragsposition,
                    gewicht: weight,
                    ean: s.EAN,
                    firma: product.Firma
                }
                lieferungen[n].positionen.push(x);
            }
        });


        var json = {
            KVNDATENIMPORT: []
        };
        //fs.writeFileSync('zwischen.json', JSON.stringify(lieferungen, null, 4));
        fs.writeFileSync('liefernr.json', JSON.stringify(Object.keys(lieferungen), null, 4));
        var auftrnr = [];
        Object.keys(lieferungen).forEach((key) => { auftrnr.push(lieferungen[key].Auftrag_Nr) })
        //fs.writeFileSync('auftrnr.json', JSON.stringify(auftrnr, null, 4));

        var auftraege = [];
        Object.keys(lieferungen).forEach((key) => {
            var l = lieferungen[key];
            if (l.Versandart == '1 Nagel Europalette') {
                try {
                    var res = berechneEuroPaletten(l.positionen);
                } catch (e) {
                    throw new Error('Lieferung ' + l.Lieferungsnummer + ' ' + e.toString());
                }
                var POSITION = {
                    INHALT: 'Feinkost',
                    'TATS.GEWICHTKG': l.Gewicht,
                    ANZAHLLHM: l.positionen.reduce((a, b) => a + b.Menge, 0),
                    LHMTYP: 'KRT',
                    ANZAHLVE: res.paletten,
                    VETYP: 'EUR',
                    STL: res.stellplaetze
                }
            } else if (l.Versandart == '4 Nagel Einwegpalette') {
                POSITION = {
                    INHALT: 'Feinkost',
                    'TATS.GEWICHTKG': l.Gewicht,
                    ANZAHLLHM: l.positionen.reduce((a, b) => a + b.Menge, 0),
                    LHMTYP: 'KRT',
                    ANZAHLVE: 1,
                    VETYP: 'EW',
                    STL: 0.25
                }

            } else {
                return;
            }
            var ADR;
            if (l.LieferAdr_PLZ) {
                if (l.LieferAdr_Telefon2) {
                    ADR = { name: 'ADRESSE', children: { ADRESSTYP: 'EMP', ADRKDNR: l.LieferAdr_Telefon2, ADRNAME1: l.LieferAdr_Firma, ADRSTRASSE: l.LieferAdr_Strasse, ADRLAND: l.LieferAdr_Land, ADRPLZ: l.LieferAdr_PLZ, ADRORT: l.LieferAdr_Ort } };
                } else {
                    // throw new Error('Lieferung ' + l.Lieferungsnummer + ': Keine Telefon2 für Nagel Kundennummer gepflegt');
                    ADR = { name: 'ADRESSE', children: { ADRESSTYP: 'EMP', ADRNAME1: l.LieferAdr_Firma, ADRSTRASSE: l.LieferAdr_Strasse, ADRLAND: l.LieferAdr_Land, ADRPLZ: l.LieferAdr_PLZ, ADRORT: l.LieferAdr_Ort } };
                }
            } else if (l.Kunde_PLZ) {
                if (l.Kunde_Telefon2) {
                    ADR = { name: 'ADRESSE', children: { ADRESSTYP: 'EMP', ADRKDNR: l.Kunde_Telefon2, ADRNAME1: l.Kunde_Firma, ADRSTRASSE: l.Kunde_Strasse, ADRLAND: l.Kunde_Land, ADRPLZ: l.Kunde_PLZ, ADRORT: l.Kunde_Ort } };
                } else {
                    // throw new Error('Lieferung ' + l.Lieferungsnummer + ': Keine Telefon2 für Nagel Kundennummer gepflegt');
                    ADR = { name: 'ADRESSE', children: { ADRESSTYP: 'EMP', ADRNAME1: l.Kunde_Firma, ADRSTRASSE: l.Kunde_Strasse, ADRLAND: l.Kunde_Land, ADRPLZ: l.Kunde_PLZ, ADRORT: l.Kunde_Ort } };
                }
            } else {
                throw new Error('Lieferung ' + l.Lieferungsnummer + ': Keine PLZ für Kunde oder Lieferadresse gepflegt');
            }
            if (ADR.children.ADRLAND == 'DE') {
                ADR.children.ADRLAND = 'D';
            } else if (ADR.children.ADRLAND == 'AUT') {
                ADR.children.ADRLAND = 'A';
            } else if (ADR.children.ADRLAND == 'CHE') {
                ADR.children.ADRLAND = 'CH';
            } else {
                throw new Error('Lieferung ' + l.Lieferungsnummer + ': Land nicht unterstützt');
            }
            ADR.children.ADRNAME1 = ADR.children.ADRNAME1.replace(/ä/g, '&auml;').replace(/ö/g, '&ouml;').replace(/ß/g, '&szlig;').replace(/ü/g, '&uuml;').replace(/Ä/g, '&Auml;').replace(/Ö/g, '&Ouml;').replace(/Ü/g, '&Uuml;');
            ADR.children.ADRSTRASSE = ADR.children.ADRSTRASSE.replace(/ä/g, '&auml;').replace(/ö/g, '&ouml;').replace(/ß/g, '&szlig;').replace(/ü/g, '&uuml;').replace(/Ä/g, '&Auml;').replace(/Ö/g, '&Ouml;').replace(/Ü/g, '&Uuml;');
            ADR.children.ADRORT = ADR.children.ADRORT.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ß/g, 'ss').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue');



            auftraege.push({
                name: 'AUFTRAG',
                children: {
                    KOPF: [
                        { AUFDAT: dateFormat(new Date(l.Lieferungsdatum), 'dd.mm.yyyy') },
                        { name: 'ADRESSE', children: { ADRESSTYP: 'ABS', ADRKDNR: '173674', ADRINDEX: 0, ADRNAME1: 'frizle fresh foods', ADRNAME2: 'AG', ADRSTRASSE: 'Peterstaler Str. 39', ADRLAND: 'D', ADRPLZ: '69118', ADRORT: 'Heidelberg', ADRORTSTEIL: 'Ziegelhausen' } },
                        ADR,
                        { PRODGR: '01' },
                        { LFTERMIN: dateFormat(new Date(l.lieferdatum), 'dd.mm.yyyy') }
                    ],
                    POSITION,
                    LIEFERSCHEIN: { LIEFERSCHEIN: l.Lieferungsnummer }
                }
            })

        });
        json.KVNDATENIMPORT = auftraege;

        fs.writeFileSync('result.xml', '<?xml version="1.0" encoding="UTF-8"?>' + jsonxml(json, { prettyPrint: true, escape: true })
            .replace(/ä/g, '&auml;').replace(/ö/g, '&ouml;').replace(/ß/g, '&szlig;').replace(/ü/g, '&uuml;').replace(/Ä/g, '&Auml;').replace(/Ö/g, '&Ouml;').replace(/Ü/g, '&Uuml;'));
        // console.log(JSON.stringify(json, null, 2));
        // console.log(jsonxml(json, { prettyPrint: true }));

        console.log('result.xml wurde erfolgreich einglegt für lieferungsnummern', Object.keys(lieferungen))

    }).catch(e => {
        //console.error(e);
        console.error(e.toString());
    });

}

function convertDate(collmex, nagel) {
    return
}
main();




function testBerechnung(pos) {
    console.log('Posten', pos.map(e => e.Menge));
    console.log('Ergebnis', berechneEuroPaletten(pos));
}




