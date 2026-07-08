// Reddit Pixel — shared across ALL patchmap.app marketing/landing pages.
// The app itself (app.patchmap.app) lives in a separate repo and must NOT load this.
//
// To add tracking to a new marketing/vanity page, paste this block in its <head>:
//
//   <!-- Reddit Pixel -->
//   <script src="/assets/reddit-pixel.js"></script>
//   <!-- End Reddit Pixel -->
//
// Pixel ID: a2_j3utzpduugxz
// Base code below is Reddit's verbatim snippet — do not modify except to add
// match keys (email/externalId) to the rdt('init', ...) call.
!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=a2_j3utzpduugxz",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);rdt('init','a2_j3utzpduugxz');rdt('track', 'PageVisit');
