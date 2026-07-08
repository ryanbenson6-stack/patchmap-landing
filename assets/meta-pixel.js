// Meta Pixel — shared across ALL patchmap.app marketing/landing pages.
// The app itself (app.patchmap.app) lives in a separate repo and must NOT load this.
//
// To add tracking to a new marketing/vanity page, paste this block in its <head>:
//
//   <!-- Meta Pixel Code -->
//   <script src="/assets/meta-pixel.js"></script>
//   <noscript><img height="1" width="1" style="display:none"
//     src="https://www.facebook.com/tr?id=1053165947067170&ev=PageView&noscript=1"/></noscript>
//   <!-- End Meta Pixel Code -->
//
// Pixel ID: 1053165947067170
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1053165947067170');
fbq('track', 'PageView');
