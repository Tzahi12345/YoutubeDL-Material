import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SubscriptionInfoDialogComponent } from './subscription-info-dialog.component';

describe('SubscriptionInfoDialogComponent', () => {
  let component: SubscriptionInfoDialogComponent;
  let fixture: ComponentFixture<SubscriptionInfoDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SubscriptionInfoDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SubscriptionInfoDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
