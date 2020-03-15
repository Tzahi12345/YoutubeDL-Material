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

// const locale = localStorage.getItem('locale');

getTranslations('assets/i18n', false, true, true, 'en', null, 'locale').then(translations => {
    if (translations) {
      loadTranslations(translations);
    }

    import('./app/app.module').then(module =>
    {
      platformBrowserDynamic()
        .bootstrapModule(module.AppModule)
        .catch(err => console.error(err));
    });
  });
platformBrowserDynamic().bootstrapModule(AppModule);
