import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TwitchChatComponent } from './twitch-chat.component';

describe('TwitchChatComponent', () => {
  let component: TwitchChatComponent;
  let fixture: ComponentFixture<TwitchChatComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TwitchChatComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TwitchChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
