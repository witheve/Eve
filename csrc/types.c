#include <runtime.h>

//-------------------------------------------------------
// Value printing
//-------------------------------------------------------

extern int sprintf(char *, const char *, ...);

void print_value(buffer b, value v)
{
    switch(type_of(v)){
    case uuid_space:
        bprintf(b , "⦑%X⦒", wrap_buffer(b->h, v, UUID_LENGTH));
        break;
    case float_space:
        {
            char temp[64];
            int c = sprintf(temp, "%g",  *(double *)v);
            buffer_append(b, temp, c);
        }
        break;
    case estring_space:
        {
            string_intermediate si = v;
            buffer_append(b, "\"", 1);
            buffer_append(b, si->body, si->length);
            buffer_append(b, "\"", 1);
        }
        break;
    case register_space:
        if (v == etrue) {
            bprintf(b, "true");
            break;
        }
        if (v == efalse) {
            bprintf(b, "false");
            break;
        }

    default:
        prf ("corrupt value %p\n", v);
    }
}

void print_value_vector(buffer out, vector vec) {
  bprintf(out, "[ ");
  vector_foreach(vec, current) {
    print_value(out, current);
    bprintf(out, " ");
  }
  bprintf(out, "]");
}

//-------------------------------------------------------
// Value hash/equals
//-------------------------------------------------------

iu64 value_as_key(value v)
{
    if (type_of(v) == float_space) {
        return *(iu64 *)v;
    }
    return (iu64)v;
}

// assumes bibop and interned strings and uuids
boolean value_equals(value a, value b)
{
    if (a == b) return true;
    if ((type_of(a) == float_space) && (type_of(b) == float_space)) {
        return *(double *)a == *(double *)b;
    }
    return false;
}

//-------------------------------------------------------
// Value vector hash/equals
//-------------------------------------------------------

iu64 value_vector_as_key(void * v)
{
  iu64 key = 0;
  vector_foreach(v, current) {
    iu64 subkey = value_as_key((value) v);
    if(key == 0) {
      key = subkey;
    } else {
      key ^= subkey;
    }
  }
  return key;
}

boolean value_vector_equals(void * a, void * b)
{
    if (a == b) return true;
    if(vector_length(a) != vector_length(b)) return false;
    int pos = 0;
    vector_foreach(a, current) {
      if(!value_equals(current, vector_get(b, pos))) return false;
      pos++;
    }
    return true;
}

//-------------------------------------------------------
// Diffing value vector tables
//-------------------------------------------------------


struct values_diff * diff_value_vector_tables(heap h, table old, table neue) {
  vector remove = allocate_vector(h, 10);
  vector insert = allocate_vector(h, 10);

  table_foreach(old, key, value) {
    if(!table_find(neue, key)) {
      vector_insert(remove, key);
    }
  }

  table_foreach(neue, key, value) {
    if(!table_find(old, key)) {
      vector_insert(insert, key);
    }
  }

  struct values_diff * diff = allocate(h, sizeof(struct values_diff));
  diff->insert = insert;
  diff->remove = remove;
  return diff;
}
