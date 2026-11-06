module.exports.getMeta = function (req, res) {
    let whiteBrand = req.client;
    if (whiteBrand && whiteBrand.meta) {
        let ret = JSON.parse(JSON.stringify(whiteBrand.meta));
        if(ret.tiposSujetosObligados && ret.tiposSujetosObligados.length>0 && typeof ret.tiposSujetosObligados[0] === 'object') ret.tiposSujetosObligados = ret.tiposSujetosObligados.map(x=>{ return x.descripcion})
        return res.status(200).send(ret);
    }
    else {
        return res.status(200).send({});
    }
}