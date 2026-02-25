import { ElementRef } from '@angular/core';
import { OnlyNumberDirective } from './only-number.directive';

describe('OnlyNumberDirective', () => {
  it('should create an instance', () => {
    const directive = new OnlyNumberDirective(new ElementRef(document.createElement('input')));
    expect(directive).toBeTruthy();
  });
});
