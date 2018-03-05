var config = require('config');
var express = require('express');
var hogan = require('hogan-express');
var compression = require('compression');
var middleware = require('middleware');
var html_minifier = require('html-minifier').minify;
var routes = require('./routes');
var views = __dirname + '/views';
var static = __dirname + '/static';
var middleware = require('middleware');
var static_file_cache = require('static_file_cache');
var fs = require('fs-extra');

// Empty the cache!
static_file_cache.flush(config.host, function(err){

  if (err) throw err;

  // Fill the cache with latest static files
  if (config.cache) fs.copy(__dirname + '/static', config.cache_directory + '/' + config.host, function(err){

    if (err) throw err;

  });
});

// The express application which serves
// the public-facing website.
var site = express();

// Define these individually don't
// overwrite server.locals
site.locals.title = 'Blot';
site.locals.host = config.host;
site.locals.cacheID = Date.now();
site.locals.protocol = config.protocol;
site.locals.price = '$' + config.stripe.plan.slice(-2);

var views = __dirname + '/views/';
var dashboard_views = require('helper').rootDir + '/app/dashboard/views/partials/'
site.use(function (req, res, next) {

  if (!req.user) {

    res.locals.partials = {
      head: views + '_head',
      header: views + '_header',
      sidebar: views + '_sidebar',
      footer: views + '_footer'
    }

  } else {

    res.locals.partials.head = dashboard_views + 'head';
    res.locals.partials.header = dashboard_views + 'header';
    res.locals.partials.nav = dashboard_views + 'nav';
    res.locals.partials.sidebar = views + '_sidebar';
    res.locals.partials.footer = dashboard_views + 'footer';
  }

  next();
});

// Enable GZIP
site.use(compression());

// Ensure site is only ever loaded over HTTPS
site.use(middleware.forceSSL);

// The disable('x-powered-by')
// and use(compression()) must
// be specified for each individual
// app. Express considers each seperately.
site.disable('x-powered-by');

// Specify the template rendering config
site.set('trust proxy', 'loopback');
site.set('view engine', 'html');
site.engine('html', hogan);
site.set('views', views);

var maxAge = 0;

// We want to cache templates in production
if (config.environment !== 'development') {
  maxAge = 86400000;
  site.enable('view cache');
}

var html_minifier_options = {
  removeComments: true,
  collapseWhitespace: true
};

site.use('/log-in', routes.log_in);
site.use('/sign-up', routes.sign_up);
site.use('/stripe-webhook', routes.stripe_webhook);
site.use('/clients', routes.clients);

// Every route underneath will be cached
// using the static file cacher. It writes
// the response generated by Blot to a file
// which NGINX then serves.
if (config.cache) site.use(static_file_cache.middleware);

// Compress HTML
site.use(function (req, res, next) {

  var send = res.send;

  res.send = function (string) {

    var html = string instanceof Buffer ? string.toString() : string;
    
    try {
      html = html_minifier(html, html_minifier_options);      
    } catch (e) {}

    send.call(this, html);
  };

  next();  
});


site.use(routes.simple);
site.use('/blot.css', routes.css);
site.use('/blot.js', routes.js);
site.use('/updates', routes.updates);
site.use('/', routes.help);

// Serve static files too
site.use(express.static(static, {maxAge: maxAge}));

// Redirect
site.use(routes.redirects);

// 404 and 5XX error handler
site.use(routes.not_found);
site.use(routes.error);

module.exports = site;