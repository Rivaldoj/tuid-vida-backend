
const lodash = require('lodash');



module.exports.get = (req, res,next) => {
    res.response.error = 1;
    res.response.data = "Error desconocido";


    let finish = lodash.after(2, function () {
        res.response.error = 0;
        res.response.data = "";
        res.status(200).json(res.response);
    });

    let monthlyQuery = "select aplicacion, year(date) as year ,month(date) as month, sum(registrations) as registrations,sum(authCodeRequests) as authCodeRequests, sum(authentications) as authentications, sum(failedAuthentications) as failedAuthentication, sum(sms) as sms, sum(emails) as emails from reports where aplicacion = ? ";
    let dailyQuery = "select aplicacion,  date, registrations, authentications, failedAuthentications, sms, emails, authCodeRequests from reports where aplicacion = ?";
  
    let params = [];

    let paramsD = [];
    if (req.query.app && req.user.rol == "S"){
        params.push(req.query.app);
        paramsD.push(req.query.app);
    }else{
        params.push(req.user.aplicacion);
        paramsD.push(req.user.aplicacion);
    }

    if (req.query.ano){
        monthlyQuery = monthlyQuery + " and year(date) = ? ";
        params.push(req.query.ano);
    }
    monthlyQuery = monthlyQuery + " group by year(date), month(date), aplicacion";
    AUTHENTICATOR_DB.query(monthlyQuery, params, function(err,rows){
        if (err){
           res.response.data = "error de conexion a base de datos";
           res.status(400).json(res.response);
        }else{
          res.response.monthly = rows;  
          finish();
        }
    });

    if (req.query.mes && req.query.ano){
        dailyQuery = dailyQuery + " and month(date) = ? and year(date) = ?";
        paramsD.push(req.query.mes);
        paramsD.push(req.query.ano);
    } else {
        dailyQuery = dailyQuery + " and month(date) = month(utc_timestamp()) and year(date) = year(utc_timestamp())"
    }
    AUTHENTICATOR_DB.query(dailyQuery, paramsD, function(err,rows){
        if (err){
           res.response.data = "error de conexion a base de datos";
           res.status(400).json(res.response);
        }else{
          res.response.daily = rows;  
          finish();
        }
    });


}

