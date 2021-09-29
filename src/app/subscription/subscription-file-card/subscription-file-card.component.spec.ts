import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { SubscriptionFileCardComponent } from './subscription-file-card.component';

describe('SubscriptionFileCardComponent', () => {
  let component: SubscriptionFileCardComponent;
  let fixture: ComponentFixture<SubscriptionFileCardComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SubscriptionFileCardComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SubscriptionFileCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
