/* BTLE_rx.cpp -o blte.js -s WASM=1 -s NO_EXIT_RUNTIME=0 -s ALLOW_MEMORY_GROWTH=1 -s SAFE_HEAP=0 -s SAFE_HEAP_LOG=0 -s STACK_OVERFLOW_CHECK=0  -s EXPORTED_FUNCTIONS="['_malloc','_free','_receiver']"  -s EXPORT_ALL=0  -s EXPORTED_RUNTIME_METHODS=['ccall']  -O3*/
#include <stdio.h>
#include <sys/uio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <ctype.h>
#include <math.h>

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <errno.h>
/* External function that is implemented in JavaScript. */
extern "C"
{
  void receiver(int8_t *, int, int, uint32_t, uint32_t, int, int);
}
static inline int
TimevalDiff(const struct timeval *a, const struct timeval *b)
{
  return ((a->tv_sec - b->tv_sec) * 1000000 + (a->tv_usec - b->tv_usec));
}

volatile bool do_exit = false;

const uint8_t BTLE_HEADER_LEN = 10;

//----------------------------------some sys stuff----------------------------------

//----------------------------------some basic signal definition----------------------------------
#define SAMPLE_PER_SYMBOL 4 // 4M sampling rate

#define LEN_BUF_IN_SAMPLE (4 * 4096) //4096 samples = ~1ms for 4Msps; ATTENTION each rx callback get hackrf.c:lib_device->buffer_size samples!!!
#define LEN_BUF (LEN_BUF_IN_SAMPLE * 2)
#define LEN_BUF_IN_SYMBOL (LEN_BUF_IN_SAMPLE / SAMPLE_PER_SYMBOL)
//----------------------------------some basic signal definition----------------------------------

//----------------------------------BTLE SPEC related--------------------------------
#include "scramble_table.h"
#define DEFAULT_CHANNEL 37
#define DEFAULT_ACCESS_ADDR (0x8E89BED6)
#define DEFAULT_CRC_INIT (0x555555)
#define MAX_CHANNEL_NUMBER 39
#define MAX_NUM_INFO_BYTE (43)
#define MAX_NUM_PHY_BYTE (47)
//#define MAX_NUM_PHY_SAMPLE ((MAX_NUM_PHY_BYTE*8*SAMPLE_PER_SYMBOL)+(LEN_GAUSS_FILTER*SAMPLE_PER_SYMBOL))
#define MAX_NUM_PHY_SAMPLE (MAX_NUM_PHY_BYTE * 8 * SAMPLE_PER_SYMBOL)
#define LEN_BUF_MAX_NUM_PHY_SAMPLE (2 * MAX_NUM_PHY_SAMPLE)

#define NUM_PREAMBLE_BYTE (1)
#define NUM_ACCESS_ADDR_BYTE (4)
#define NUM_PREAMBLE_ACCESS_BYTE (NUM_PREAMBLE_BYTE + NUM_ACCESS_ADDR_BYTE)
//----------------------------------BTLE SPEC related--------------------------------

typedef int8_t IQ_TYPE;

//----------------------------------MISC MISC MISC----------------------------------

void octet_hex_to_bit(char *hex, char *bit)
{
  char tmp_hex[3];

  tmp_hex[0] = hex[0];
  tmp_hex[1] = hex[1];
  tmp_hex[2] = 0;

  int n = strtol(tmp_hex, NULL, 16);

  bit[0] = 0x01 & (n >> 0);
  bit[1] = 0x01 & (n >> 1);
  bit[2] = 0x01 & (n >> 2);
  bit[3] = 0x01 & (n >> 3);
  bit[4] = 0x01 & (n >> 4);
  bit[5] = 0x01 & (n >> 5);
  bit[6] = 0x01 & (n >> 6);
  bit[7] = 0x01 & (n >> 7);
}

void int_to_bit(int n, uint8_t *bit)
{
  bit[0] = 0x01 & (n >> 0);
  bit[1] = 0x01 & (n >> 1);
  bit[2] = 0x01 & (n >> 2);
  bit[3] = 0x01 & (n >> 3);
  bit[4] = 0x01 & (n >> 4);
  bit[5] = 0x01 & (n >> 5);
  bit[6] = 0x01 & (n >> 6);
  bit[7] = 0x01 & (n >> 7);
}

void uint32_to_bit_array(uint32_t uint32_in, uint8_t *bit)
{
  int i;
  uint32_t uint32_tmp = uint32_in;
  for (i = 0; i < 32; i++)
  {
    bit[i] = 0x01 & uint32_tmp;
    uint32_tmp = (uint32_tmp >> 1);
  }
}

void byte_array_to_bit_array(uint8_t *byte_in, int num_byte, uint8_t *bit)
{
  int i, j;
  j = 0;
  for (i = 0; i < num_byte * 8; i = i + 8)
  {
    int_to_bit(byte_in[j], bit + i);
    j++;
  }
}

int convert_hex_to_bit(char *hex, char *bit)
{
  int num_hex = strlen(hex);
  while (hex[num_hex - 1] <= 32 || hex[num_hex - 1] >= 127)
  {
    num_hex--;
  }

  if (num_hex % 2 != 0)
  {
    printf("convert_hex_to_bit: Half octet is encountered! num_hex %d\n", num_hex);
    printf("%s\n", hex);
    return (-1);
  }

  int num_bit = num_hex * 4;

  int i, j;
  for (i = 0; i < num_hex; i = i + 2)
  {
    j = i * 4;
    octet_hex_to_bit(hex + i, bit + j);
  }

  return (num_bit);
}
//----------------------------------MISC MISC MISC----------------------------------

//----------------------------------BTLE SPEC related--------------------------------
/**
 * Static table used for the table_driven implementation.
 *****************************************************************************/
static const uint_fast32_t crc_table[256] = {
    0x000000, 0x01b4c0, 0x036980, 0x02dd40, 0x06d300, 0x0767c0, 0x05ba80, 0x040e40,
    0x0da600, 0x0c12c0, 0x0ecf80, 0x0f7b40, 0x0b7500, 0x0ac1c0, 0x081c80, 0x09a840,
    0x1b4c00, 0x1af8c0, 0x182580, 0x199140, 0x1d9f00, 0x1c2bc0, 0x1ef680, 0x1f4240,
    0x16ea00, 0x175ec0, 0x158380, 0x143740, 0x103900, 0x118dc0, 0x135080, 0x12e440,
    0x369800, 0x372cc0, 0x35f180, 0x344540, 0x304b00, 0x31ffc0, 0x332280, 0x329640,
    0x3b3e00, 0x3a8ac0, 0x385780, 0x39e340, 0x3ded00, 0x3c59c0, 0x3e8480, 0x3f3040,
    0x2dd400, 0x2c60c0, 0x2ebd80, 0x2f0940, 0x2b0700, 0x2ab3c0, 0x286e80, 0x29da40,
    0x207200, 0x21c6c0, 0x231b80, 0x22af40, 0x26a100, 0x2715c0, 0x25c880, 0x247c40,
    0x6d3000, 0x6c84c0, 0x6e5980, 0x6fed40, 0x6be300, 0x6a57c0, 0x688a80, 0x693e40,
    0x609600, 0x6122c0, 0x63ff80, 0x624b40, 0x664500, 0x67f1c0, 0x652c80, 0x649840,
    0x767c00, 0x77c8c0, 0x751580, 0x74a140, 0x70af00, 0x711bc0, 0x73c680, 0x727240,
    0x7bda00, 0x7a6ec0, 0x78b380, 0x790740, 0x7d0900, 0x7cbdc0, 0x7e6080, 0x7fd440,
    0x5ba800, 0x5a1cc0, 0x58c180, 0x597540, 0x5d7b00, 0x5ccfc0, 0x5e1280, 0x5fa640,
    0x560e00, 0x57bac0, 0x556780, 0x54d340, 0x50dd00, 0x5169c0, 0x53b480, 0x520040,
    0x40e400, 0x4150c0, 0x438d80, 0x423940, 0x463700, 0x4783c0, 0x455e80, 0x44ea40,
    0x4d4200, 0x4cf6c0, 0x4e2b80, 0x4f9f40, 0x4b9100, 0x4a25c0, 0x48f880, 0x494c40,
    0xda6000, 0xdbd4c0, 0xd90980, 0xd8bd40, 0xdcb300, 0xdd07c0, 0xdfda80, 0xde6e40,
    0xd7c600, 0xd672c0, 0xd4af80, 0xd51b40, 0xd11500, 0xd0a1c0, 0xd27c80, 0xd3c840,
    0xc12c00, 0xc098c0, 0xc24580, 0xc3f140, 0xc7ff00, 0xc64bc0, 0xc49680, 0xc52240,
    0xcc8a00, 0xcd3ec0, 0xcfe380, 0xce5740, 0xca5900, 0xcbedc0, 0xc93080, 0xc88440,
    0xecf800, 0xed4cc0, 0xef9180, 0xee2540, 0xea2b00, 0xeb9fc0, 0xe94280, 0xe8f640,
    0xe15e00, 0xe0eac0, 0xe23780, 0xe38340, 0xe78d00, 0xe639c0, 0xe4e480, 0xe55040,
    0xf7b400, 0xf600c0, 0xf4dd80, 0xf56940, 0xf16700, 0xf0d3c0, 0xf20e80, 0xf3ba40,
    0xfa1200, 0xfba6c0, 0xf97b80, 0xf8cf40, 0xfcc100, 0xfd75c0, 0xffa880, 0xfe1c40,
    0xb75000, 0xb6e4c0, 0xb43980, 0xb58d40, 0xb18300, 0xb037c0, 0xb2ea80, 0xb35e40,
    0xbaf600, 0xbb42c0, 0xb99f80, 0xb82b40, 0xbc2500, 0xbd91c0, 0xbf4c80, 0xbef840,
    0xac1c00, 0xada8c0, 0xaf7580, 0xaec140, 0xaacf00, 0xab7bc0, 0xa9a680, 0xa81240,
    0xa1ba00, 0xa00ec0, 0xa2d380, 0xa36740, 0xa76900, 0xa6ddc0, 0xa40080, 0xa5b440,
    0x81c800, 0x807cc0, 0x82a180, 0x831540, 0x871b00, 0x86afc0, 0x847280, 0x85c640,
    0x8c6e00, 0x8ddac0, 0x8f0780, 0x8eb340, 0x8abd00, 0x8b09c0, 0x89d480, 0x886040,
    0x9a8400, 0x9b30c0, 0x99ed80, 0x985940, 0x9c5700, 0x9de3c0, 0x9f3e80, 0x9e8a40,
    0x972200, 0x9696c0, 0x944b80, 0x95ff40, 0x91f100, 0x9045c0, 0x929880, 0x932c40};

typedef enum
{
  LL_RESERVED,
  LL_DATA1,
  LL_DATA2,
  LL_CTRL
} LL_PDU_TYPE;

const char *LL_PDU_TYPE_STR[] = {
    "LL_RESERVED",
    "LL_DATA1",
    "LL_DATA2",
    "LL_CTRL"};

typedef struct
{
  uint8_t Data[40];
} LL_DATA_PDU_PAYLOAD_TYPE;

typedef enum
{
  LL_CONNECTION_UPDATE_REQ = 0,
  LL_CHANNEL_MAP_REQ = 1,
  LL_TERMINATE_IND = 2,
  LL_ENC_REQ = 3,
  LL_ENC_RSP = 4,
  LL_START_ENC_REQ = 5,
  LL_START_ENC_RSP = 6,
  LL_UNKNOWN_RSP = 7,
  LL_FEATURE_REQ = 8,
  LL_FEATURE_RSP = 9,
  LL_PAUSE_ENC_REQ = 10,
  LL_PAUSE_ENC_RSP = 11,
  LL_VERSION_IND = 12,
  LL_REJECT_IND = 13
} LL_CTRL_PDU_PAYLOAD_TYPE;

const char *LL_CTRL_PDU_PAYLOAD_TYPE_STR[] = {
    "LL_CONNECTION_UPDATE_REQ",
    "LL_CHANNEL_MAP_REQ",
    "LL_TERMINATE_IND",
    "LL_ENC_REQ",
    "LL_ENC_RSP",
    "LL_START_ENC_REQ",
    "LL_START_ENC_RSP",
    "LL_UNKNOWN_RSP",
    "LL_FEATURE_REQ",
    "LL_FEATURE_RSP",
    "LL_PAUSE_ENC_REQ",
    "LL_PAUSE_ENC_RSP",
    "LL_VERSION_IND",
    "LL_REJECT_IND",
    "LL_RESERVED"};

typedef struct
{
  uint8_t Opcode;
  uint8_t WinSize;
  uint16_t WinOffset;
  uint16_t Interval;
  uint16_t Latency;
  uint16_t Timeout;
  uint16_t Instant;
} LL_CTRL_PDU_PAYLOAD_TYPE_0;

typedef struct
{
  uint8_t Opcode;
  uint8_t ChM[5];
  uint16_t Instant;
} LL_CTRL_PDU_PAYLOAD_TYPE_1;

typedef struct
{
  uint8_t Opcode;
  uint8_t ErrorCode;
} LL_CTRL_PDU_PAYLOAD_TYPE_2_7_13;

typedef struct
{
  uint8_t Opcode;
  uint8_t Rand[8];
  uint8_t EDIV[2];
  uint8_t SKDm[8];
  uint8_t IVm[4];
} LL_CTRL_PDU_PAYLOAD_TYPE_3;

typedef struct
{
  uint8_t Opcode;
  uint8_t SKDs[8];
  uint8_t IVs[4];
} LL_CTRL_PDU_PAYLOAD_TYPE_4;

typedef struct
{
  uint8_t Opcode;
} LL_CTRL_PDU_PAYLOAD_TYPE_5_6_10_11;

typedef struct
{
  uint8_t Opcode;
  uint8_t FeatureSet[8];
} LL_CTRL_PDU_PAYLOAD_TYPE_8_9;

typedef struct
{
  uint8_t Opcode;
  uint8_t VersNr;
  uint16_t CompId;
  uint16_t SubVersNr;
} LL_CTRL_PDU_PAYLOAD_TYPE_12;

typedef struct
{
  uint8_t Opcode;
  uint8_t payload_byte[40];
} LL_CTRL_PDU_PAYLOAD_TYPE_R;

typedef enum
{
  ADV_IND = 0,
  ADV_DIRECT_IND = 1,
  ADV_NONCONN_IND = 2,
  SCAN_REQ = 3,
  SCAN_RSP = 4,
  CONNECT_REQ = 5,
  ADV_SCAN_IND = 6,
  RESERVED0 = 7,
  RESERVED1 = 8,
  RESERVED2 = 9,
  RESERVED3 = 10,
  RESERVED4 = 11,
  RESERVED5 = 12,
  RESERVED6 = 13,
  RESERVED7 = 14,
  RESERVED8 = 15
} ADV_PDU_TYPE;

const char *ADV_PDU_TYPE_STR[] = {
    "ADV_IND",
    "ADV_DIRECT_IND",
    "ADV_NONCONN_IND",
    "SCAN_REQ",
    "SCAN_RSP",
    "CONNECT_REQ",
    "ADV_SCAN_IND",
    "RESERVED0",
    "RESERVED1",
    "RESERVED2",
    "RESERVED3",
    "RESERVED4",
    "RESERVED5",
    "RESERVED6",
    "RESERVED7",
    "RESERVED8"};

typedef struct
{
  uint8_t AdvA[6];
  uint8_t Data[31];
} ADV_PDU_PAYLOAD_TYPE_0_2_4_6;

typedef struct
{
  uint8_t A0[6];
  uint8_t A1[6];
} ADV_PDU_PAYLOAD_TYPE_1_3;

typedef struct
{
  uint8_t InitA[6];
  uint8_t AdvA[6];
  uint8_t AA[4];
  uint32_t CRCInit;
  uint8_t WinSize;
  uint16_t WinOffset;
  uint16_t Interval;
  uint16_t Latency;
  uint16_t Timeout;
  uint8_t ChM[5];
  uint8_t Hop;
  uint8_t SCA;
} ADV_PDU_PAYLOAD_TYPE_5;

typedef struct
{
  uint8_t payload_byte[40];
} ADV_PDU_PAYLOAD_TYPE_R;

/**
 * Update the crc value with new data.
 *
 * \param crc      The current crc value.
 * \param data     Pointer to a buffer of \a data_len bytes.
 * \param data_len Number of bytes in the \a data buffer.
 * \return         The updated crc value.
 *****************************************************************************/
uint_fast32_t crc_update(uint_fast32_t crc, const void *data, size_t data_len)
{
  const unsigned char *d = (const unsigned char *)data;
  unsigned int tbl_idx;

  while (data_len--)
  {
    tbl_idx = (crc ^ *d) & 0xff;
    crc = (crc_table[tbl_idx] ^ (crc >> 8)) & 0xffffff;

    d++;
  }
  return crc & 0xffffff;
}

uint_fast32_t crc24_byte(uint8_t *byte_in, int num_byte, uint32_t init_hex)
{
  uint_fast32_t crc = init_hex;

  crc = crc_update(crc, byte_in, num_byte);

  return (crc);
}

void scramble_byte(uint8_t *byte_in, int num_byte, const uint8_t *scramble_table_byte, uint8_t *byte_out)
{
  int i;
  for (i = 0; i < num_byte; i++)
  {
    byte_out[i] = byte_in[i] ^ scramble_table_byte[i];
  }
}
//----------------------------------BTLE SPEC related----------------------------------

//----------------------------------receiver----------------------------------
typedef struct
{
  int pkt_avaliable;
  int hop;
  int new_chm_flag;
  int interval;
  uint32_t access_addr;
  uint32_t crc_init;
  uint8_t chm[5];
  bool crc_ok;
} RECV_STATUS;

//#define LEN_DEMOD_BUF_PREAMBLE_ACCESS ( (NUM_PREAMBLE_ACCESS_BYTE*8)-8 ) // to get 2^x integer
//#define LEN_DEMOD_BUF_PREAMBLE_ACCESS 32
//#define LEN_DEMOD_BUF_PREAMBLE_ACCESS (NUM_PREAMBLE_ACCESS_BYTE*8)
#define LEN_DEMOD_BUF_ACCESS (NUM_ACCESS_ADDR_BYTE * 8) //32 = 2^5

//static uint8_t demod_buf_preamble_access[SAMPLE_PER_SYMBOL][LEN_DEMOD_BUF_PREAMBLE_ACCESS];
static uint8_t demod_buf_access[SAMPLE_PER_SYMBOL][LEN_DEMOD_BUF_ACCESS];
//uint8_t preamble_access_byte[NUM_PREAMBLE_ACCESS_BYTE] = {0xAA, 0xD6, 0xBE, 0x89, 0x8E};
uint8_t access_byte[NUM_ACCESS_ADDR_BYTE] = {0xD6, 0xBE, 0x89, 0x8E};
//uint8_t preamble_access_bit[NUM_PREAMBLE_ACCESS_BYTE*8];
uint8_t access_bit[NUM_ACCESS_ADDR_BYTE * 8];
uint8_t access_bit_mask[NUM_ACCESS_ADDR_BYTE * 8];
uint8_t tmp_byte[2 + 37 + 3]; // header length + maximum payload length 37 + 3 octets CRC

RECV_STATUS receiver_status;

void demod_byte(IQ_TYPE *rxp, int num_byte, uint8_t *out_byte)
{
  int i, j;
  int I0, Q0, I1, Q1;
  uint8_t bit_decision;
  int sample_idx = 0;

  for (i = 0; i < num_byte; i++)
  {
    out_byte[i] = 0;
    for (j = 0; j < 8; j++)
    {
      I0 = rxp[sample_idx];
      Q0 = rxp[sample_idx + 1];
      I1 = rxp[sample_idx + 2];
      Q1 = rxp[sample_idx + 3];
      bit_decision = (I0 * Q1 - I1 * Q0) > 0 ? 1 : 0;
      out_byte[i] = out_byte[i] | (bit_decision << j);

      sample_idx = sample_idx + SAMPLE_PER_SYMBOL * 2;
    }
  }
}

inline int search_unique_bits(IQ_TYPE *rxp, int search_len, uint8_t *unique_bits, uint8_t *unique_bits_mask, const int num_bits)
{
  int i, sp, j, i0, q0, i1, q1, k, p, phase_idx;
  bool unequal_flag;
  const int demod_buf_len = num_bits;
  int demod_buf_offset = 0;

  //demod_buf_preamble_access[SAMPLE_PER_SYMBOL][LEN_DEMOD_BUF_PREAMBLE_ACCESS]
  //memset(demod_buf_preamble_access, 0, SAMPLE_PER_SYMBOL*LEN_DEMOD_BUF_PREAMBLE_ACCESS);
  memset(demod_buf_access, 0, SAMPLE_PER_SYMBOL * LEN_DEMOD_BUF_ACCESS);
  for (i = 0; i < search_len * SAMPLE_PER_SYMBOL * 2; i = i + (SAMPLE_PER_SYMBOL * 2))
  {
    sp = ((demod_buf_offset - demod_buf_len + 1) & (demod_buf_len - 1));
    //sp = (demod_buf_offset-demod_buf_len+1);
    //if (sp>=demod_buf_len)
    //  sp = sp - demod_buf_len;

    for (j = 0; j < (SAMPLE_PER_SYMBOL * 2); j = j + 2)
    {
      i0 = rxp[i + j];
      q0 = rxp[i + j + 1];
      i1 = rxp[i + j + 2];
      q1 = rxp[i + j + 3];

      phase_idx = j / 2;
      //demod_buf_preamble_access[phase_idx][demod_buf_offset] = (i0*q1 - i1*q0) > 0? 1: 0;
      demod_buf_access[phase_idx][demod_buf_offset] = (i0 * q1 - i1 * q0) > 0 ? 1 : 0;

      k = sp;
      unequal_flag = false;
      for (p = 0; p < demod_buf_len; p++)
      {
        //if (demod_buf_preamble_access[phase_idx][k] != unique_bits[p]) {
        if (demod_buf_access[phase_idx][k] != unique_bits[p] && unique_bits_mask[p])
        {
          unequal_flag = true;
          break;
        }
        k = ((k + 1) & (demod_buf_len - 1));
        //k = (k + 1);
        //if (k>=demod_buf_len)
        //  k = k - demod_buf_len;
      }

      if (unequal_flag == false)
      {
        return (i + j - (demod_buf_len - 1) * SAMPLE_PER_SYMBOL * 2);
      }
    }

    demod_buf_offset = ((demod_buf_offset + 1) & (demod_buf_len - 1));
    //demod_buf_offset  = (demod_buf_offset+1);
    //if (demod_buf_offset>=demod_buf_len)
    //  demod_buf_offset = demod_buf_offset - demod_buf_len;
  }

  return (-1);
}

int parse_adv_pdu_payload_byte(uint8_t *payload_byte, int num_payload_byte, ADV_PDU_TYPE pdu_type, void *adv_pdu_payload)
{
  ADV_PDU_PAYLOAD_TYPE_0_2_4_6 *payload_type_0_2_4_6 = NULL;
  ADV_PDU_PAYLOAD_TYPE_1_3 *payload_type_1_3 = NULL;
  ADV_PDU_PAYLOAD_TYPE_5 *payload_type_5 = NULL;
  ADV_PDU_PAYLOAD_TYPE_R *payload_type_R = NULL;
  if (num_payload_byte < 6)
  {
    //payload_parse_result_str = ['Payload Too Short (only ' num2str(length(payload_bits)) ' bits)'];
    printf("Error: Payload Too Short (only %d bytes)!\n", num_payload_byte);
    return (-1);
  }

  if (pdu_type == ADV_IND || pdu_type == ADV_NONCONN_IND || pdu_type == SCAN_RSP || pdu_type == ADV_SCAN_IND)
  {
    payload_type_0_2_4_6 = (ADV_PDU_PAYLOAD_TYPE_0_2_4_6 *)adv_pdu_payload;

    //AdvA = reorder_bytes_str( payload_bytes(1 : (2*6)) );
    payload_type_0_2_4_6->AdvA[0] = payload_byte[5];
    payload_type_0_2_4_6->AdvA[1] = payload_byte[4];
    payload_type_0_2_4_6->AdvA[2] = payload_byte[3];
    payload_type_0_2_4_6->AdvA[3] = payload_byte[2];
    payload_type_0_2_4_6->AdvA[4] = payload_byte[1];
    payload_type_0_2_4_6->AdvA[5] = payload_byte[0];

    //AdvData = payload_bytes((2*6+1):end);
    //for(i=0; i<(num_payload_byte-6); i++) {
    //  payload_type_0_2_4_6->Data[i] = payload_byte[6+i];
    //}
    memcpy(payload_type_0_2_4_6->Data, payload_byte + 6, num_payload_byte - 6);

    //payload_parse_result_str = ['AdvA:' AdvA ' AdvData:' AdvData];
  }
  else if (pdu_type == ADV_DIRECT_IND || pdu_type == SCAN_REQ)
  {
    if (num_payload_byte != 12)
    {
      printf("Error: Payload length %d bytes. Need to be 12 for PDU Type %s!\n", num_payload_byte, ADV_PDU_TYPE_STR[pdu_type]);
      return (-1);
    }
    payload_type_1_3 = (ADV_PDU_PAYLOAD_TYPE_1_3 *)adv_pdu_payload;

    //AdvA = reorder_bytes_str( payload_bytes(1 : (2*6)) );
    payload_type_1_3->A0[0] = payload_byte[5];
    payload_type_1_3->A0[1] = payload_byte[4];
    payload_type_1_3->A0[2] = payload_byte[3];
    payload_type_1_3->A0[3] = payload_byte[2];
    payload_type_1_3->A0[4] = payload_byte[1];
    payload_type_1_3->A0[5] = payload_byte[0];

    //InitA = reorder_bytes_str( payload_bytes((2*6+1):end) );
    payload_type_1_3->A1[0] = payload_byte[11];
    payload_type_1_3->A1[1] = payload_byte[10];
    payload_type_1_3->A1[2] = payload_byte[9];
    payload_type_1_3->A1[3] = payload_byte[8];
    payload_type_1_3->A1[4] = payload_byte[7];
    payload_type_1_3->A1[5] = payload_byte[6];

    //payload_parse_result_str = ['AdvA:' AdvA ' InitA:' InitA];
  }
  else if (pdu_type == CONNECT_REQ)
  {
    if (num_payload_byte != 34)
    {
      printf("Error: Payload length %d bytes. Need to be 34 for PDU Type %s!\n", num_payload_byte, ADV_PDU_TYPE_STR[pdu_type]);
      return (-1);
    }
    payload_type_5 = (ADV_PDU_PAYLOAD_TYPE_5 *)adv_pdu_payload;

    //InitA = reorder_bytes_str( payload_bytes(1 : (2*6)) );
    payload_type_5->InitA[0] = payload_byte[5];
    payload_type_5->InitA[1] = payload_byte[4];
    payload_type_5->InitA[2] = payload_byte[3];
    payload_type_5->InitA[3] = payload_byte[2];
    payload_type_5->InitA[4] = payload_byte[1];
    payload_type_5->InitA[5] = payload_byte[0];

    //AdvA = reorder_bytes_str( payload_bytes((2*6+1):(2*6+2*6)) );
    payload_type_5->AdvA[0] = payload_byte[11];
    payload_type_5->AdvA[1] = payload_byte[10];
    payload_type_5->AdvA[2] = payload_byte[9];
    payload_type_5->AdvA[3] = payload_byte[8];
    payload_type_5->AdvA[4] = payload_byte[7];
    payload_type_5->AdvA[5] = payload_byte[6];

    //AA = reorder_bytes_str( payload_bytes((2*6+2*6+1):(2*6+2*6+2*4)) );
    payload_type_5->AA[0] = payload_byte[15];
    payload_type_5->AA[1] = payload_byte[14];
    payload_type_5->AA[2] = payload_byte[13];
    payload_type_5->AA[3] = payload_byte[12];

    //CRCInit = payload_bytes((2*6+2*6+2*4+1):(2*6+2*6+2*4+2*3));
    payload_type_5->CRCInit = (payload_byte[16]);
    payload_type_5->CRCInit = ((payload_type_5->CRCInit << 8) | payload_byte[17]);
    payload_type_5->CRCInit = ((payload_type_5->CRCInit << 8) | payload_byte[18]);

    //WinSize = payload_bytes((2*6+2*6+2*4+2*3+1):(2*6+2*6+2*4+2*3+2*1));
    payload_type_5->WinSize = payload_byte[19];

    //WinOffset = reorder_bytes_str( payload_bytes((2*6+2*6+2*4+2*3+2*1+1):(2*6+2*6+2*4+2*3+2*1+2*2)) );
    payload_type_5->WinOffset = (payload_byte[21]);
    payload_type_5->WinOffset = ((payload_type_5->WinOffset << 8) | payload_byte[20]);

    //Interval = reorder_bytes_str( payload_bytes((2*6+2*6+2*4+2*3+2*1+2*2+1):(2*6+2*6+2*4+2*3+2*1+2*2+2*2)) );
    payload_type_5->Interval = (payload_byte[23]);
    payload_type_5->Interval = ((payload_type_5->Interval << 8) | payload_byte[22]);

    //Latency = reorder_bytes_str( payload_bytes((2*6+2*6+2*4+2*3+2*1+2*2+2*2+1):(2*6+2*6+2*4+2*3+2*1+2*2+2*2+2*2)) );
    payload_type_5->Latency = (payload_byte[25]);
    payload_type_5->Latency = ((payload_type_5->Latency << 8) | payload_byte[24]);

    //Timeout = reorder_bytes_str( payload_bytes((2*6+2*6+2*4+2*3+2*1+2*2+2*2+2*2+1):(2*6+2*6+2*4+2*3+2*1+2*2+2*2+2*2+2*2)) );
    payload_type_5->Timeout = (payload_byte[27]);
    payload_type_5->Timeout = ((payload_type_5->Timeout << 8) | payload_byte[26]);

    //ChM = reorder_bytes_str( payload_bytes((2*6+2*6+2*4+2*3+2*1+2*2+2*2+2*2+2*2+1):(2*6+2*6+2*4+2*3+2*1+2*2+2*2+2*2+2*2+2*5)) );
    payload_type_5->ChM[0] = payload_byte[32];
    payload_type_5->ChM[1] = payload_byte[31];
    payload_type_5->ChM[2] = payload_byte[30];
    payload_type_5->ChM[3] = payload_byte[29];
    payload_type_5->ChM[4] = payload_byte[28];

    //tmp_bits = payload_bits((end-7) : end);
    //Hop = num2str( bi2de(tmp_bits(1:5), 'right-msb') );
    //SCA = num2str( bi2de(tmp_bits(6:end), 'right-msb') );
    payload_type_5->Hop = (payload_byte[33] & 0x1F);
    payload_type_5->SCA = ((payload_byte[33] >> 5) & 0x07);

    receiver_status.hop = payload_type_5->Hop;
    receiver_status.new_chm_flag = 1;
    receiver_status.interval = payload_type_5->Interval;

    receiver_status.access_addr = (payload_byte[15]);
    receiver_status.access_addr = ((receiver_status.access_addr << 8) | payload_byte[14]);
    receiver_status.access_addr = ((receiver_status.access_addr << 8) | payload_byte[13]);
    receiver_status.access_addr = ((receiver_status.access_addr << 8) | payload_byte[12]);

    receiver_status.crc_init = payload_type_5->CRCInit;

    receiver_status.chm[0] = payload_type_5->ChM[0];
    receiver_status.chm[1] = payload_type_5->ChM[1];
    receiver_status.chm[2] = payload_type_5->ChM[2];
    receiver_status.chm[3] = payload_type_5->ChM[3];
    receiver_status.chm[4] = payload_type_5->ChM[4];
  }
  else
  {
    payload_type_R = (ADV_PDU_PAYLOAD_TYPE_R *)adv_pdu_payload;

    //for(i=0; i<(num_payload_byte); i++) {
    //  payload_type_R->payload_byte[i] = payload_byte[i];
    //}
    memcpy(payload_type_R->payload_byte, payload_byte, num_payload_byte);

    //printf("Warning: Reserved PDU type %d\n", pdu_type);
    //return(-1);
  }

  return (0);
}

int parse_ll_pdu_payload_byte(uint8_t *payload_byte, int num_payload_byte, LL_PDU_TYPE pdu_type, void *ll_pdu_payload)
{
  int ctrl_pdu_type;
  LL_DATA_PDU_PAYLOAD_TYPE *data_payload = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_0 *ctrl_payload_type_0 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_1 *ctrl_payload_type_1 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_2_7_13 *ctrl_payload_type_2_7_13 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_3 *ctrl_payload_type_3 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_4 *ctrl_payload_type_4 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_5_6_10_11 *ctrl_payload_type_5_6_10_11 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_8_9 *ctrl_payload_type_8_9 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_12 *ctrl_payload_type_12 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_R *ctrl_payload_type_R = NULL;

  if (num_payload_byte == 0)
  {
    if (pdu_type == LL_RESERVED || pdu_type == LL_DATA1)
    {
      return (0);
    }
    else if (pdu_type == LL_DATA2 || pdu_type == LL_CTRL)
    {
      printf("Error: LL PDU TYPE%d(%s) should not have payload length 0!\n", pdu_type, LL_PDU_TYPE_STR[pdu_type]);
      return (-1);
    }
  }

  if (pdu_type == LL_RESERVED || pdu_type == LL_DATA1 || pdu_type == LL_DATA2)
  {
    data_payload = (LL_DATA_PDU_PAYLOAD_TYPE *)ll_pdu_payload;
    memcpy(data_payload->Data, payload_byte, num_payload_byte);
  }
  else if (pdu_type == LL_CTRL)
  {
    ctrl_pdu_type = payload_byte[0];
    if (ctrl_pdu_type == LL_CONNECTION_UPDATE_REQ)
    {
      if (num_payload_byte != 12)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 12!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }

      ctrl_payload_type_0 = (LL_CTRL_PDU_PAYLOAD_TYPE_0 *)ll_pdu_payload;
      ctrl_payload_type_0->Opcode = ctrl_pdu_type;

      ctrl_payload_type_0->WinSize = payload_byte[1];

      ctrl_payload_type_0->WinOffset = (payload_byte[3]);
      ctrl_payload_type_0->WinOffset = ((ctrl_payload_type_0->WinOffset << 8) | payload_byte[2]);

      ctrl_payload_type_0->Interval = (payload_byte[5]);
      ctrl_payload_type_0->Interval = ((ctrl_payload_type_0->Interval << 8) | payload_byte[4]);

      ctrl_payload_type_0->Latency = (payload_byte[7]);
      ctrl_payload_type_0->Latency = ((ctrl_payload_type_0->Latency << 8) | payload_byte[6]);

      ctrl_payload_type_0->Timeout = (payload_byte[9]);
      ctrl_payload_type_0->Timeout = ((ctrl_payload_type_0->Timeout << 8) | payload_byte[8]);

      ctrl_payload_type_0->Instant = (payload_byte[11]);
      ctrl_payload_type_0->Instant = ((ctrl_payload_type_0->Instant << 8) | payload_byte[10]);

      receiver_status.interval = ctrl_payload_type_0->Interval;
    }
    else if (ctrl_pdu_type == LL_CHANNEL_MAP_REQ)
    {
      if (num_payload_byte != 8)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 8!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }
      ctrl_payload_type_1 = (LL_CTRL_PDU_PAYLOAD_TYPE_1 *)ll_pdu_payload;
      ctrl_payload_type_1->Opcode = ctrl_pdu_type;

      ctrl_payload_type_1->ChM[0] = payload_byte[5];
      ctrl_payload_type_1->ChM[1] = payload_byte[4];
      ctrl_payload_type_1->ChM[2] = payload_byte[3];
      ctrl_payload_type_1->ChM[3] = payload_byte[2];
      ctrl_payload_type_1->ChM[4] = payload_byte[1];

      ctrl_payload_type_1->Instant = (payload_byte[7]);
      ctrl_payload_type_1->Instant = ((ctrl_payload_type_1->Instant << 8) | payload_byte[6]);

      receiver_status.new_chm_flag = 1;

      receiver_status.chm[0] = ctrl_payload_type_1->ChM[0];
      receiver_status.chm[1] = ctrl_payload_type_1->ChM[1];
      receiver_status.chm[2] = ctrl_payload_type_1->ChM[2];
      receiver_status.chm[3] = ctrl_payload_type_1->ChM[3];
      receiver_status.chm[4] = ctrl_payload_type_1->ChM[4];
    }
    else if (ctrl_pdu_type == LL_TERMINATE_IND || ctrl_pdu_type == LL_UNKNOWN_RSP || ctrl_pdu_type == LL_REJECT_IND)
    {
      if (num_payload_byte != 2)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 2!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }
      ctrl_payload_type_2_7_13 = (LL_CTRL_PDU_PAYLOAD_TYPE_2_7_13 *)ll_pdu_payload;
      ctrl_payload_type_2_7_13->Opcode = ctrl_pdu_type;

      ctrl_payload_type_2_7_13->ErrorCode = payload_byte[1];
    }
    else if (ctrl_pdu_type == LL_ENC_REQ)
    {
      if (num_payload_byte != 23)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 23!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }
      ctrl_payload_type_3 = (LL_CTRL_PDU_PAYLOAD_TYPE_3 *)ll_pdu_payload;
      ctrl_payload_type_3->Opcode = ctrl_pdu_type;

      ctrl_payload_type_3->Rand[0] = payload_byte[8];
      ctrl_payload_type_3->Rand[1] = payload_byte[7];
      ctrl_payload_type_3->Rand[2] = payload_byte[6];
      ctrl_payload_type_3->Rand[3] = payload_byte[5];
      ctrl_payload_type_3->Rand[4] = payload_byte[4];
      ctrl_payload_type_3->Rand[5] = payload_byte[3];
      ctrl_payload_type_3->Rand[6] = payload_byte[2];
      ctrl_payload_type_3->Rand[7] = payload_byte[1];

      ctrl_payload_type_3->EDIV[0] = payload_byte[10];
      ctrl_payload_type_3->EDIV[1] = payload_byte[9];

      ctrl_payload_type_3->SKDm[0] = payload_byte[18];
      ctrl_payload_type_3->SKDm[1] = payload_byte[17];
      ctrl_payload_type_3->SKDm[2] = payload_byte[16];
      ctrl_payload_type_3->SKDm[3] = payload_byte[15];
      ctrl_payload_type_3->SKDm[4] = payload_byte[14];
      ctrl_payload_type_3->SKDm[5] = payload_byte[13];
      ctrl_payload_type_3->SKDm[6] = payload_byte[12];
      ctrl_payload_type_3->SKDm[7] = payload_byte[11];

      ctrl_payload_type_3->IVm[0] = payload_byte[22];
      ctrl_payload_type_3->IVm[1] = payload_byte[21];
      ctrl_payload_type_3->IVm[2] = payload_byte[20];
      ctrl_payload_type_3->IVm[3] = payload_byte[19];
    }
    else if (ctrl_pdu_type == LL_ENC_RSP)
    {
      if (num_payload_byte != 13)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 13!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }
      ctrl_payload_type_4 = (LL_CTRL_PDU_PAYLOAD_TYPE_4 *)ll_pdu_payload;
      ctrl_payload_type_4->Opcode = ctrl_pdu_type;

      ctrl_payload_type_4->SKDs[0] = payload_byte[8];
      ctrl_payload_type_4->SKDs[1] = payload_byte[7];
      ctrl_payload_type_4->SKDs[2] = payload_byte[6];
      ctrl_payload_type_4->SKDs[3] = payload_byte[5];
      ctrl_payload_type_4->SKDs[4] = payload_byte[4];
      ctrl_payload_type_4->SKDs[5] = payload_byte[3];
      ctrl_payload_type_4->SKDs[6] = payload_byte[2];
      ctrl_payload_type_4->SKDs[7] = payload_byte[1];

      ctrl_payload_type_4->IVs[0] = payload_byte[12];
      ctrl_payload_type_4->IVs[1] = payload_byte[11];
      ctrl_payload_type_4->IVs[2] = payload_byte[10];
      ctrl_payload_type_4->IVs[3] = payload_byte[9];
    }
    else if (ctrl_pdu_type == LL_START_ENC_REQ || ctrl_pdu_type == LL_START_ENC_RSP || ctrl_pdu_type == LL_PAUSE_ENC_REQ || ctrl_pdu_type == LL_PAUSE_ENC_RSP)
    {
      if (num_payload_byte != 1)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 1!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }
      ctrl_payload_type_5_6_10_11 = (LL_CTRL_PDU_PAYLOAD_TYPE_5_6_10_11 *)ll_pdu_payload;
      ctrl_payload_type_5_6_10_11->Opcode = ctrl_pdu_type;
    }
    else if (ctrl_pdu_type == LL_FEATURE_REQ || ctrl_pdu_type == LL_FEATURE_RSP)
    {
      if (num_payload_byte != 9)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 9!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }
      ctrl_payload_type_8_9 = (LL_CTRL_PDU_PAYLOAD_TYPE_8_9 *)ll_pdu_payload;
      ctrl_payload_type_8_9->Opcode = ctrl_pdu_type;

      ctrl_payload_type_8_9->FeatureSet[0] = payload_byte[8];
      ctrl_payload_type_8_9->FeatureSet[1] = payload_byte[7];
      ctrl_payload_type_8_9->FeatureSet[2] = payload_byte[6];
      ctrl_payload_type_8_9->FeatureSet[3] = payload_byte[5];
      ctrl_payload_type_8_9->FeatureSet[4] = payload_byte[4];
      ctrl_payload_type_8_9->FeatureSet[5] = payload_byte[3];
      ctrl_payload_type_8_9->FeatureSet[6] = payload_byte[2];
      ctrl_payload_type_8_9->FeatureSet[7] = payload_byte[1];
    }
    else if (ctrl_pdu_type == LL_VERSION_IND)
    {
      if (num_payload_byte != 6)
      {
        printf("Error: LL CTRL PDU TYPE%d(%s) should have payload length 6!\n", ctrl_pdu_type, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
        return (-1);
      }
      ctrl_payload_type_12 = (LL_CTRL_PDU_PAYLOAD_TYPE_12 *)ll_pdu_payload;
      ctrl_payload_type_12->Opcode = ctrl_pdu_type;

      ctrl_payload_type_12->VersNr = payload_byte[1];

      ctrl_payload_type_12->CompId = (payload_byte[3]);
      ctrl_payload_type_12->CompId = ((ctrl_payload_type_12->CompId << 8) | payload_byte[2]);

      ctrl_payload_type_12->SubVersNr = (payload_byte[5]);
      ctrl_payload_type_12->SubVersNr = ((ctrl_payload_type_12->SubVersNr << 8) | payload_byte[4]);
    }
    else
    {
      ctrl_payload_type_R = (LL_CTRL_PDU_PAYLOAD_TYPE_R *)ll_pdu_payload;
      ctrl_payload_type_R->Opcode = ctrl_pdu_type;
      memcpy(ctrl_payload_type_R->payload_byte, payload_byte + 1, num_payload_byte - 1);
    }
  }

  return (ctrl_pdu_type);
}

void parse_ll_pdu_header_byte(uint8_t *byte_in, LL_PDU_TYPE *llid, int *nesn, int *sn, int *md, int *payload_len)
{
  (*llid) = (LL_PDU_TYPE)(byte_in[0] & 0x03);
  (*nesn) = ((byte_in[0] & 0x04) != 0);
  (*sn) = ((byte_in[0] & 0x08) != 0);
  (*md) = ((byte_in[0] & 0x10) != 0);
  (*payload_len) = (byte_in[1] & 0x1F);
}

void parse_adv_pdu_header_byte(uint8_t *byte_in, ADV_PDU_TYPE *pdu_type, int *tx_add, int *rx_add, int *payload_len)
{
  (*pdu_type) = (ADV_PDU_TYPE)(byte_in[0] & 0x0F);

  (*tx_add) = ((byte_in[0] & 0x40) != 0);

  (*rx_add) = ((byte_in[0] & 0x80) != 0);

  //payload_len = bi2de(bits(9:14), 'right-msb');
  (*payload_len) = (byte_in[1] & 0x3F);
}

bool crc_check(uint8_t *tmp_byte, int body_len, uint32_t crc_init)
{
  int crc24_checksum, crc24_received; //, i;

  crc24_checksum = crc24_byte(tmp_byte, body_len, crc_init); // 0x555555 --> 0xaaaaaa. maybe because byte order
  crc24_received = 0;
  crc24_received = ((crc24_received << 8) | tmp_byte[body_len + 2]);
  crc24_received = ((crc24_received << 8) | tmp_byte[body_len + 1]);
  crc24_received = ((crc24_received << 8) | tmp_byte[body_len + 0]);
  return (crc24_checksum != crc24_received);
}

void print_ll_pdu_payload(void *ll_pdu_payload, LL_PDU_TYPE pdu_type, int ctrl_pdu_type, int num_payload_byte, bool crc_flag)
{
  int i;
  LL_DATA_PDU_PAYLOAD_TYPE *data_payload = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_0 *ctrl_payload_type_0 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_1 *ctrl_payload_type_1 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_2_7_13 *ctrl_payload_type_2_7_13 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_3 *ctrl_payload_type_3 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_4 *ctrl_payload_type_4 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_5_6_10_11 *ctrl_payload_type_5_6_10_11 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_8_9 *ctrl_payload_type_8_9 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_12 *ctrl_payload_type_12 = NULL;
  LL_CTRL_PDU_PAYLOAD_TYPE_R *ctrl_payload_type_R = NULL;

  if (num_payload_byte == 0)
  {
    printf("CRC%d\n", crc_flag);
    return;
  }

  if (pdu_type == LL_RESERVED || pdu_type == LL_DATA1 || pdu_type == LL_DATA2)
  {
    data_payload = (LL_DATA_PDU_PAYLOAD_TYPE *)ll_pdu_payload;
    //memcpy(data_payload->Data, payload_byte, num_payload_byte);
    printf("LL_Data:");
    for (i = 0; i < (num_payload_byte); i++)
    {
      printf("%02x", data_payload->Data[i]);
    }
  }
  else if (pdu_type == LL_CTRL)
  {
    if (ctrl_pdu_type == LL_CONNECTION_UPDATE_REQ)
    {
      ctrl_payload_type_0 = (LL_CTRL_PDU_PAYLOAD_TYPE_0 *)ll_pdu_payload;
      printf("Op%02x(%s) WSize:%02x WOffset:%04x Itrvl:%04x Ltncy:%04x Timot:%04x Inst:%04x",
             ctrl_payload_type_0->Opcode,
             LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type],
             ctrl_payload_type_0->WinSize, ctrl_payload_type_0->WinOffset, ctrl_payload_type_0->Interval, ctrl_payload_type_0->Latency, ctrl_payload_type_0->Timeout, ctrl_payload_type_0->Instant);
    }
    else if (ctrl_pdu_type == LL_CHANNEL_MAP_REQ)
    {
      ctrl_payload_type_1 = (LL_CTRL_PDU_PAYLOAD_TYPE_1 *)ll_pdu_payload;
      printf("Op%02x(%s)", ctrl_payload_type_1->Opcode, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
      printf(" ChM:");
      for (i = 0; i < 5; i++)
      {
        printf("%02x", ctrl_payload_type_1->ChM[i]);
      }
      printf(" Inst:%04x", ctrl_payload_type_1->Instant);
    }
    else if (ctrl_pdu_type == LL_TERMINATE_IND || ctrl_pdu_type == LL_UNKNOWN_RSP || ctrl_pdu_type == LL_REJECT_IND)
    {
      ctrl_payload_type_2_7_13 = (LL_CTRL_PDU_PAYLOAD_TYPE_2_7_13 *)ll_pdu_payload;
      printf("Op%02x(%s) Err:%02x", ctrl_payload_type_2_7_13->Opcode, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type], ctrl_payload_type_2_7_13->ErrorCode);
    }
    else if (ctrl_pdu_type == LL_ENC_REQ)
    {
      ctrl_payload_type_3 = (LL_CTRL_PDU_PAYLOAD_TYPE_3 *)ll_pdu_payload;
      printf("Op%02x(%s)", ctrl_payload_type_3->Opcode, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
      printf(" Rand:");
      for (i = 0; i < 8; i++)
      {
        printf("%02x", ctrl_payload_type_3->Rand[i]);
      }
      printf(" EDIV:");
      for (i = 0; i < 2; i++)
      {
        printf("%02x", ctrl_payload_type_3->EDIV[i]);
      }
      printf(" SKDm:");
      for (i = 0; i < 8; i++)
      {
        printf("%02x", ctrl_payload_type_3->SKDm[i]);
      }
      printf(" IVm:");
      for (i = 0; i < 4; i++)
      {
        printf("%02x", ctrl_payload_type_3->IVm[i]);
      }
    }
    else if (ctrl_pdu_type == LL_ENC_RSP)
    {
      ctrl_payload_type_4 = (LL_CTRL_PDU_PAYLOAD_TYPE_4 *)ll_pdu_payload;
      printf("Op%02x(%s)", ctrl_payload_type_4->Opcode, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
      printf(" SKDs:");
      for (i = 0; i < 8; i++)
      {
        printf("%02x", ctrl_payload_type_4->SKDs[i]);
      }
      printf(" IVs:");
      for (i = 0; i < 4; i++)
      {
        printf("%02x", ctrl_payload_type_4->IVs[i]);
      }
    }
    else if (ctrl_pdu_type == LL_START_ENC_REQ || ctrl_pdu_type == LL_START_ENC_RSP || ctrl_pdu_type == LL_PAUSE_ENC_REQ || ctrl_pdu_type == LL_PAUSE_ENC_RSP)
    {
      ctrl_payload_type_5_6_10_11 = (LL_CTRL_PDU_PAYLOAD_TYPE_5_6_10_11 *)ll_pdu_payload;
      printf("Op%02x(%s)", ctrl_payload_type_5_6_10_11->Opcode, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
    }
    else if (ctrl_pdu_type == LL_FEATURE_REQ || ctrl_pdu_type == LL_FEATURE_RSP)
    {
      ctrl_payload_type_8_9 = (LL_CTRL_PDU_PAYLOAD_TYPE_8_9 *)ll_pdu_payload;
      printf("Op%02x(%s)", ctrl_payload_type_8_9->Opcode, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
      printf(" FteurSet:");
      for (i = 0; i < 8; i++)
      {
        printf("%02x", ctrl_payload_type_8_9->FeatureSet[i]);
      }
    }
    else if (ctrl_pdu_type == LL_VERSION_IND)
    {
      ctrl_payload_type_12 = (LL_CTRL_PDU_PAYLOAD_TYPE_12 *)ll_pdu_payload;
      printf("Op%02x(%s) Ver:%02x CompId:%04x SubVer:%04x",
             ctrl_payload_type_12->Opcode,
             LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type],
             ctrl_payload_type_12->VersNr, ctrl_payload_type_12->CompId, ctrl_payload_type_12->SubVersNr);
    }
    else
    {
      if (ctrl_pdu_type > LL_REJECT_IND)
        ctrl_pdu_type = LL_REJECT_IND + 1;
      ctrl_payload_type_R = (LL_CTRL_PDU_PAYLOAD_TYPE_R *)ll_pdu_payload;
      printf("Op%02x(%s)", ctrl_payload_type_R->Opcode, LL_CTRL_PDU_PAYLOAD_TYPE_STR[ctrl_pdu_type]);
      printf(" Byte:");
      for (i = 0; i < (num_payload_byte - 1); i++)
      {
        printf("%02x", ctrl_payload_type_R->payload_byte[i]);
      }
    }
  }

  printf(" CRC%d\n", crc_flag);
}

void print_adv_pdu_payload(void *adv_pdu_payload, ADV_PDU_TYPE pdu_type, int payload_len, bool crc_flag)
{
  int i;
  ADV_PDU_PAYLOAD_TYPE_5 *adv_pdu_payload_5;
  ADV_PDU_PAYLOAD_TYPE_1_3 *adv_pdu_payload_1_3;
  ADV_PDU_PAYLOAD_TYPE_0_2_4_6 *adv_pdu_payload_0_2_4_6;
  ADV_PDU_PAYLOAD_TYPE_R *adv_pdu_payload_R;
  // print payload out
  if (pdu_type == ADV_IND || pdu_type == ADV_NONCONN_IND || pdu_type == SCAN_RSP || pdu_type == ADV_SCAN_IND)
  {
    adv_pdu_payload_0_2_4_6 = (ADV_PDU_PAYLOAD_TYPE_0_2_4_6 *)(adv_pdu_payload);
    printf("AdvA:");
    for (i = 0; i < 6; i++)
    {
      printf("%02x", adv_pdu_payload_0_2_4_6->AdvA[i]);
    }
    printf(" Data:");
    for (i = 0; i < (payload_len - 6); i++)
    {
      printf("%02x", adv_pdu_payload_0_2_4_6->Data[i]);
    }
  }
  else if (pdu_type == ADV_DIRECT_IND || pdu_type == SCAN_REQ)
  {
    adv_pdu_payload_1_3 = (ADV_PDU_PAYLOAD_TYPE_1_3 *)(adv_pdu_payload);
    printf("A0:");
    for (i = 0; i < 6; i++)
    {
      printf("%02x", adv_pdu_payload_1_3->A0[i]);
    }
    printf(" A1:");
    for (i = 0; i < 6; i++)
    {
      printf("%02x", adv_pdu_payload_1_3->A1[i]);
    }
  }
  else if (pdu_type == CONNECT_REQ)
  {
    adv_pdu_payload_5 = (ADV_PDU_PAYLOAD_TYPE_5 *)(adv_pdu_payload);
    printf("InitA:");
    for (i = 0; i < 6; i++)
    {
      printf("%02x", adv_pdu_payload_5->InitA[i]);
    }
    printf(" AdvA:");
    for (i = 0; i < 6; i++)
    {
      printf("%02x", adv_pdu_payload_5->AdvA[i]);
    }
    printf(" AA:");
    for (i = 0; i < 4; i++)
    {
      printf("%02x", adv_pdu_payload_5->AA[i]);
    }
    printf(" CRCInit:%06x WSize:%02x WOffset:%04x Itrvl:%04x Ltncy:%04x Timot:%04x", adv_pdu_payload_5->CRCInit, adv_pdu_payload_5->WinSize, adv_pdu_payload_5->WinOffset, adv_pdu_payload_5->Interval, adv_pdu_payload_5->Latency, adv_pdu_payload_5->Timeout);
    printf(" ChM:");
    for (i = 0; i < 5; i++)
    {
      printf("%02x", adv_pdu_payload_5->ChM[i]);
    }
    printf(" Hop:%d SCA:%d", adv_pdu_payload_5->Hop, adv_pdu_payload_5->SCA);
  }
  else
  {
    adv_pdu_payload_R = (ADV_PDU_PAYLOAD_TYPE_R *)(adv_pdu_payload);
    printf("Byte:");
    for (i = 0; i < (payload_len); i++)
    {
      printf("%02x", adv_pdu_payload_R->payload_byte[i]);
    }
  }
  printf(" CRC%d\n", crc_flag);
}

// demodulates and parses a packet
void receiver(IQ_TYPE *rxp_in, int buf_len, int channel_number, uint32_t access_addr, uint32_t crc_init, int verbose_flag, int raw_flag)
{
  static int pkt_count = 0;
  static ADV_PDU_PAYLOAD_TYPE_R adv_pdu_payload;
  static LL_DATA_PDU_PAYLOAD_TYPE ll_data_pdu_payload;
  static struct timeval time_current_pkt, time_pre_pkt;
  const int demod_buf_len = LEN_BUF_MAX_NUM_PHY_SAMPLE + (LEN_BUF / 2);

  ADV_PDU_TYPE adv_pdu_type;
  LL_PDU_TYPE ll_pdu_type;

  IQ_TYPE *rxp = rxp_in;
  int num_demod_byte, hit_idx, buf_len_eaten, adv_tx_add, adv_rx_add, ll_nesn, ll_sn, ll_md, payload_len, time_diff, ll_ctrl_pdu_type, i;
  int num_symbol_left = buf_len / (SAMPLE_PER_SYMBOL * 2); //2 for IQ
  bool crc_flag;
  bool adv_flag = (channel_number == 37 || channel_number == 38 || channel_number == 39);

  /*  if (pkt_count == 0) { // the 1st time run
    gettimeofday(&time_current_pkt, NULL);
    time_pre_pkt = time_current_pkt;
  }*/

  uint32_to_bit_array(access_addr, access_bit);
  buf_len_eaten = 0;
  while (1)
  {
    hit_idx = search_unique_bits(rxp, num_symbol_left, access_bit, access_bit_mask, LEN_DEMOD_BUF_ACCESS);
    if (hit_idx == -1)
    {
      break;
    }
    //pkt_count++;
    printf("hit %d\n", hit_idx);

    printf("%d %d %d %d %d %d %d %d\n", rxp[hit_idx+0], rxp[hit_idx+1], rxp[hit_idx+2], rxp[hit_idx+3], rxp[hit_idx+4], rxp[hit_idx+5], rxp[hit_idx+6], rxp[hit_idx+7]);

    buf_len_eaten = buf_len_eaten + hit_idx;
    //printf("%d\n", buf_len_eaten);

    buf_len_eaten = buf_len_eaten + 8 * NUM_ACCESS_ADDR_BYTE * 2 * SAMPLE_PER_SYMBOL; // move to beginning of PDU header
    rxp = rxp_in + buf_len_eaten;

    if (raw_flag)
      num_demod_byte = 42;
    else
      num_demod_byte = 2; // PDU header has 2 octets

    buf_len_eaten = buf_len_eaten + 8 * num_demod_byte * 2 * SAMPLE_PER_SYMBOL;
    //if ( buf_len_eaten > buf_len ) {
    if (buf_len_eaten > demod_buf_len)
    {
      break;
    }

    demod_byte(rxp, num_demod_byte, tmp_byte);

    if (!raw_flag)
      scramble_byte(tmp_byte, num_demod_byte, scramble_table[channel_number], tmp_byte);
    rxp = rxp_in + buf_len_eaten;
    num_symbol_left = (buf_len - buf_len_eaten) / (SAMPLE_PER_SYMBOL * 2);

    if (raw_flag)
    { //raw recv stop here
      pkt_count++;

      /*    gettimeofday(&time_current_pkt, NULL);
      time_diff = TimevalDiff(&time_current_pkt, &time_pre_pkt);
      time_pre_pkt = time_current_pkt;*/

      printf("%dus Pkt%d Ch%d AA:%08x ", time_diff, pkt_count, channel_number, access_addr);
      printf("Raw:");
      for (i = 0; i < 42; i++)
      {
        printf("%02x", tmp_byte[i]);
      }
      printf("\n");

      continue;
    }

    if (adv_flag)
    {
      parse_adv_pdu_header_byte(tmp_byte, &adv_pdu_type, &adv_tx_add, &adv_rx_add, &payload_len);
      if (payload_len < 6 || payload_len > 37)
      {
        if (verbose_flag)
        {
          printf("XXXus PktBAD Ch%d AA:%08x ", channel_number, access_addr);
          printf("ADV_PDU_t%d:%s T%d R%d PloadL%d ", adv_pdu_type, ADV_PDU_TYPE_STR[adv_pdu_type], adv_tx_add, adv_rx_add, payload_len);
          printf("Error: ADV payload length should be 6~37!\n");
        }
        continue;
      }
    }
    else
    {
      parse_ll_pdu_header_byte(tmp_byte, &ll_pdu_type, &ll_nesn, &ll_sn, &ll_md, &payload_len);
    }

    //num_pdu_payload_crc_bits = (payload_len+3)*8;
    num_demod_byte = (payload_len + 3);
    buf_len_eaten = buf_len_eaten + 8 * num_demod_byte * 2 * SAMPLE_PER_SYMBOL;
    //if ( buf_len_eaten > buf_len ) {
    if (buf_len_eaten > demod_buf_len)
    {
      //printf("\n");
      break;
    }

    demod_byte(rxp, num_demod_byte, tmp_byte + 2);
    scramble_byte(tmp_byte + 2, num_demod_byte, scramble_table[channel_number] + 2, tmp_byte + 2);
    rxp = rxp_in + buf_len_eaten;
    num_symbol_left = (buf_len - buf_len_eaten) / (SAMPLE_PER_SYMBOL * 2);

    crc_flag = crc_check(tmp_byte, payload_len + 2, crc_init);
    pkt_count++;
    receiver_status.pkt_avaliable = 1;
    receiver_status.crc_ok = (crc_flag == 0);

    /* gettimeofday(&time_current_pkt, NULL);
    time_diff = TimevalDiff(&time_current_pkt, &time_pre_pkt);
    time_pre_pkt = time_current_pkt;*/

    printf("%07dus Pkt%03d Ch%d AA:%08x ", time_diff, pkt_count, channel_number, access_addr);

    if (adv_flag)
    {
      printf("ADV_PDU_t%d:%s T%d R%d PloadL%d ", adv_pdu_type, ADV_PDU_TYPE_STR[adv_pdu_type], adv_tx_add, adv_rx_add, payload_len);

      if (parse_adv_pdu_payload_byte(tmp_byte + 2, payload_len, adv_pdu_type, (void *)(&adv_pdu_payload)) != 0)
      {
        continue;
      }
      print_adv_pdu_payload((void *)(&adv_pdu_payload), adv_pdu_type, payload_len, crc_flag);
    }
    else
    {
      printf("LL_PDU_t%d:%s NESN%d SN%d MD%d PloadL%d ", ll_pdu_type, LL_PDU_TYPE_STR[ll_pdu_type], ll_nesn, ll_sn, ll_md, payload_len);

      if ((ll_ctrl_pdu_type = parse_ll_pdu_payload_byte(tmp_byte + 2, payload_len, ll_pdu_type, (void *)(&ll_data_pdu_payload))) < 0)
      {
        continue;
      }
      print_ll_pdu_payload((void *)(&ll_data_pdu_payload), ll_pdu_type, ll_ctrl_pdu_type, payload_len, crc_flag);
    }
  }
}
