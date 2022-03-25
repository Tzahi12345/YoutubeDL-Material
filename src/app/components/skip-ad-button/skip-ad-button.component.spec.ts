import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SkipAdButtonComponent } from './skip-ad-button.component';

describe('SkipAdButtonComponent', () => {
  let component: SkipAdButtonComponent;
  let fixture: ComponentFixture<SkipAdButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SkipAdButtonComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SkipAdButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
