//---------------------handle freq hop for channel mapping 1FFFFFFFFF--------------------
function chm_is_full_map(chm) {
  if ((chm[0] == 0x1F) && (chm[1] == 0xFF) && (chm[2] == 0xFF) && (chm[3] == 0xFF) && (chm[4] == 0xFF)) {
    return (true);
  }
  return (false);
}

// state machine
function receiver_controller(verbose_flag) {
  let hop_chan = 0;
  const state = 0;
  const  hop;
  const freq_hz;

  switch (state) {
    case 0: // wait for track
        if (!chm_is_full_map(receiver_status.chm)) {
          console.log("Hop: Not full ChnMap 1FFFFFFFFF! Stay in ADV Chn\n", receiver_status.chm[0], receiver_status.chm[1], receiver_status.chm[2], receiver_status.chm[3], receiver_status.chm[4]);
          return;
        }

        console.log("Hop: track start ...\n");

        hop_chan = ((hop_chan + hop) % 37);
        freq_hz = get_freq_by_channel_number(hop_chan);

        console.log("Hop: next ch %d freq MHz access %08x crcInit %06x\n", hop_chan, freq_hz / 1000000, receiver_status.access_addr, receiver_status.crc_init);

        state = 1;
        console.log("Hop: next state %d\n", state);
      break;

    case 1: // wait for the 1st packet in data channel
      console.log("Hop: 1st data pdu\n");
      state = 2;
      console.log("Hop: next state %d\n", state);

      break;

    case 2: // wait for time is up. let hop to next chan

      hop_chan = ((hop_chan + hop) % 37);
      freq_hz = get_freq_by_channel_number(hop_chan);

      if (verbose_flag) console.log("Hop: next ch %d freq %ldMHz\n", hop_chan, freq_hz / 1000000);

      state = 3;
      if (verbose_flag) console.log("Hop: next state %d\n", state);

      break;

    case 3: // wait for the 1st packet in new data channel
      state = 2;
      if (verbose_flag) console.log("Hop: next state %d\n", state);

      if (verbose_flag) console.log("Hop: skip\n");


      hop_chan = ((hop_chan + hop) % 37);
      freq_hz = get_freq_by_channel_number(hop_chan);

      if (verbose_flag) console.log("Hop: next ch %d freq %ldMHz\n", hop_chan, freq_hz / 1000000);

      if (verbose_flag) console.log("Hop: next state %d\n", state);
      break;
  }
}
function get_freq_by_channel_number(channel_number) {
  let freq_hz;
  if (channel_number == 37) {
    freq_hz = 2402000000;
  } else if (channel_number == 38) {
    freq_hz = 2426000000;
  } else if (channel_number == 39) {
    freq_hz = 2480000000;
  } else if (channel_number >= 0 && channel_number <= 10) {
    freq_hz = 2404000000 + channel_number * 2000000;
  } else if (channel_number >= 11 && channel_number <= 36) {
    freq_hz = 2428000000 + (channel_number - 11) * 2000000;
  } else {
    freq_hz = 0xffffffffffffffff;
  }
  return freq_hz;
}