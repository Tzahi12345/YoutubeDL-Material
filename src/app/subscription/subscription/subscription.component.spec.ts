import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { SubscriptionComponent } from './subscription.component';

describe('SubscriptionComponent', () => {
  let component: SubscriptionComponent;
  let fixture: ComponentFixture<SubscriptionComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SubscriptionComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SubscriptionComponent);
    component = fixture.componentInstance;
    component.subscription = {
      id: 'sub-1',
      name: 'Test subscription',
      downloading: false,
      videos: []
    } as any;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
