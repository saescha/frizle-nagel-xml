const co = require('co');
const fs = require('fs');
const path = require('path');
const Collmex = require('co-collmex');


var collmex = new Collmex({
    User: "5055877",
    Password: "3769154",
    "CMXKundennummer": 146247,
    "Firma_Nr": 1,
    "Systemname": "koa-collmex-test"
});

function main() {
    co(function* () {
        var lfr_nr = JSON.parse(fs.readFileSync('liefernr.json'));

        lfr_nr.forEach((l) => {
            co(function* () {
                var result = yield collmex.get({ Satzart: 'SHIPMENT_ORDERS_GET', Lieferung_Nr: l }, 'raw');
                console.log('Versandübergabe für Lieferung', l, 'übermittelt');
                fs.writeFile(path.join('lieferscheine', l), result, (err) => {
                    if (err) return console.error('Lieferung', l.Lieferungsnummer, 'konnte nicht geschrieben werden:', err);
                    console.log('Schein für Lieferung', l, 'erstellt');
                });
            });
        });
    });
}

main();