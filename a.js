const co = require('co');
const fs = require('fs');
const ss = require('string-similarity');
const Collmex = require('co-collmex');

var collmex = new Collmex({
    User: "5055877",
    Password: "3769154",
    "CMXKundennummer": 146247,
    "Firma_Nr": 1,
    "Systemname": "koa-collmex-test"
});

// co(function* () {
//     var res = yield collmex.get({ Satzart: "ADDRESS_GET"});
//     fs.writeFileSync('kunden.json.json', JSON.stringify(res,null,4));
// })
// var collmex = JSON.parse(fs.readFileSync('collmex-adressen.json').toString());
// var nagel = JSON.parse(fs.readFileSync('n-adressen.json').toString());

// var result = [];

// collmex.forEach(e1 => {
//     if (e1.PLZ && e1.PLZ != '') {
//         var n = nagel.filter(e2 => e2.PLZ == e1.PLZ);
//         var best = { r: 0, n: null };
//         var matches = 0;
//         n.forEach(e2 => {
//             var r = ss.compareTwoStrings(e1.Straße, e2.Straße);
//             matches++;
//             if (r > best.r) {
//                 best.r = r;
//                 best.n = e2['Kd-Nr.'];
//                 best.Straße = e2.Straße;
//             }
//         });
//         if (best.r > 0.65) {
//             e1.Telefon2 = best.n;
//             result.push(e1);
//         }
//     }

// });
// console.log('collmex adressen', collmex.filter(e => e.PLZ && e.PLZ != '').length);
// console.log('nagel adressen', nagel.length);
// console.log('matches', result.length);
// fs.writeFileSync('adress-result.json', JSON.stringify(result, null, 2));



co(function* () {
    var adresses = JSON.parse(fs.readFileSync('adress-result.json'));

      var res = yield collmex.get(adresses.slice(278,adresses.length));
    // var res = yield collmex.get(adresses.slice(188,adresses.length));
     console.log(JSON.stringify(res));

    //  console.log(adresses[277]);

    // adresses.slice(187,190)
    // console.log(JSON.stringify(adresses,null,4));
    // console.log(adresses.length);
    //

    // adresses.forEach(element => {
    //     console.log(JSON.stringify(element));
    //     var res = yield collmex.get(element);
    // });



})