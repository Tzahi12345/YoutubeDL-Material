import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

import { loadTranslations } from '@angular/localize';
import { getTranslations } from '@soluling/angular';
import '@angular/localize/init';

if (environment.production) {
  enableProdMode();
}

const locale = localStorage.getItem('locale');
if (locale) {
  fetch(`./assets/i18n/messages.${locale}.json`).then(res => res.json()).then((resp) => {
    console.log(resp);
    loadTranslations(resp);
    platformBrowserDynamic().bootstrapModule(AppModule);
  }, err => {
    platformBrowserDynamic().bootstrapModule(AppModule);
  });
} else {
  console.log('no locale');
  platformBrowserDynamic().bootstrapModule(AppModule);
}
